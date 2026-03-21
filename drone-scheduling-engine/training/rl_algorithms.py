import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.optim as optim
from torch_geometric.data import Data, Batch
import numpy as np
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
from collections import deque
import random
import copy

from models.gat_model import GATValueNetwork, SpatialTemporalGraphBuilder
from training.rl_environment import DroneSchedulingEnv, State, Action, Transition, ReplayBuffer
from config import settings


class GATEncoder(nn.Module):
    
    def __init__(
        self,
        input_dim: int = 32,
        hidden_dim: int = 64,
        output_dim: int = 128,
        num_heads: int = 4,
        num_layers: int = 2,
        dropout: float = 0.1,
    ):
        super().__init__()
        
        from torch_geometric.nn import GATConv
        
        self.input_projection = nn.Linear(input_dim, hidden_dim)
        
        self.gat_layers = nn.ModuleList()
        for i in range(num_layers):
            in_channels = hidden_dim if i == 0 else hidden_dim * num_heads
            self.gat_layers.append(
                GATConv(in_channels, hidden_dim, heads=num_heads, dropout=dropout, concat=True)
            )
        
        self.output_projection = nn.Linear(hidden_dim * num_heads, output_dim)
        self.layer_norm = nn.LayerNorm(output_dim)
    
    def forward(self, x, edge_index, edge_attr=None):
        x = self.input_projection(x)
        x = F.elu(x)
        
        for gat_layer in self.gat_layers:
            x = gat_layer(x, edge_index, edge_attr)
            x = F.elu(x)
        
        x = self.output_projection(x)
        x = self.layer_norm(x)
        
        return x


class DQNNetwork(nn.Module):
    
    def __init__(
        self,
        num_drones: int = 50,
        num_nests: int = 20,
        gat_hidden_dim: int = 64,
        q_hidden_dim: int = 256,
    ):
        super().__init__()
        
        self.num_drones = num_drones
        self.num_nests = num_nests
        
        self.gat_encoder = GATEncoder(
            input_dim=32,
            hidden_dim=gat_hidden_dim,
            output_dim=128,
        )
        
        self.drone_embedding = nn.Sequential(
            nn.Linear(128, 64),
            nn.ELU(),
            nn.Linear(64, 32),
        )
        
        self.nest_embedding = nn.Sequential(
            nn.Linear(128, 64),
            nn.ELU(),
            nn.Linear(64, 32),
        )
        
        self.q_network = nn.Sequential(
            nn.Linear(32 + 32 + 16, q_hidden_dim),
            nn.ELU(),
            nn.Dropout(0.1),
            nn.Linear(q_hidden_dim, q_hidden_dim // 2),
            nn.ELU(),
            nn.Dropout(0.1),
            nn.Linear(q_hidden_dim // 2, 1),
        )
        
        self.context_encoder = nn.Sequential(
            nn.Linear(256, 128),
            nn.ELU(),
            nn.Linear(128, 16),
        )
    
    def forward(
        self,
        graph_data: Data,
        drone_indices: torch.Tensor,
        nest_indices: torch.Tensor,
    ):
        node_embeddings = self.gat_encoder(
            graph_data.x,
            graph_data.edge_index,
            graph_data.edge_attr if hasattr(graph_data, 'edge_attr') else None
        )
        
        drone_embeds = node_embeddings[drone_indices]
        drone_embeds = self.drone_embedding(drone_embeds)
        
        nest_embeds = node_embeddings[nest_indices]
        nest_embeds = self.nest_embedding(nest_embeds)
        
        global_features = torch.mean(node_embeddings, dim=0)
        context = self.context_encoder(
            torch.cat([global_features, torch.std(node_embeddings, dim=0)])
        )
        context = context.unsqueeze(0).expand(drone_embeds.size(0), -1)
        
        q_input = torch.cat([drone_embeds, nest_embeds, context], dim=-1)
        q_values = self.q_network(q_input)
        
        return q_values.squeeze(-1)


class DQNAgent:
    
    def __init__(
        self,
        num_drones: int = 50,
        num_nests: int = 20,
        learning_rate: float = 1e-4,
        gamma: float = 0.99,
        epsilon_start: float = 1.0,
        epsilon_end: float = 0.01,
        epsilon_decay: float = 0.995,
        buffer_size: int = 100000,
        batch_size: int = 64,
        target_update_freq: int = 1000,
        device: str = None,
    ):
        self.num_drones = num_drones
        self.num_nests = num_nests
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        
        self.q_network = DQNNetwork(num_drones, num_nests).to(self.device)
        self.target_network = copy.deepcopy(self.q_network)
        self.target_network.eval()
        
        self.optimizer = optim.Adam(self.q_network.parameters(), lr=learning_rate)
        self.scheduler = optim.lr_scheduler.StepLR(self.optimizer, step_size=10000, gamma=0.95)
        
        self.replay_buffer = ReplayBuffer(buffer_size)
        self.batch_size = batch_size
        
        self.gamma = gamma
        self.epsilon = epsilon_start
        self.epsilon_end = epsilon_end
        self.epsilon_decay = epsilon_decay
        self.target_update_freq = target_update_freq
        
        self.steps_done = 0
        self.training_history = []
    
    def select_action(
        self,
        state: State,
        valid_actions: List[Action],
        explore: bool = True,
    ) -> Optional[Action]:
        if not valid_actions:
            return None
        
        if explore and random.random() < self.epsilon:
            return random.choice(valid_actions)
        
        with torch.no_grad():
            graph_data = state.graph_data.to(self.device)
            
            drone_indices = []
            nest_indices = []
            action_map = []
            
            for action in valid_actions:
                drone_idx = next(i for i, d in enumerate(state.drones) if d.id == action.drone_id)
                nest_idx = next(i for i, n in enumerate(state.nests) if n.id == action.nest_id)
                drone_indices.append(drone_idx)
                nest_indices.append(nest_idx)
                action_map.append(action)
            
            if not drone_indices:
                return random.choice(valid_actions)
            
            drone_tensor = torch.tensor(drone_indices, dtype=torch.long, device=self.device)
            nest_tensor = torch.tensor(nest_indices, dtype=torch.long, device=self.device)
            
            q_values = self.q_network(graph_data, drone_tensor, nest_tensor)
            
            best_idx = q_values.argmax().item()
            return action_map[best_idx]
    
    def store_transition(self, transition: Transition):
        self.replay_buffer.push(transition)
    
    def train_step(self) -> Optional[float]:
        if len(self.replay_buffer) < self.batch_size:
            return None
        
        batch = self.replay_buffer.sample(self.batch_size)
        
        states = [t.state for t in batch]
        actions = [t.action for t in batch]
        rewards = torch.tensor([t.reward for t in batch], dtype=torch.float32, device=self.device)
        next_states = [t.next_state for t in batch]
        dones = torch.tensor([t.done for t in batch], dtype=torch.float32, device=self.device)
        
        current_q_values = []
        for i, (state, action) in enumerate(zip(states, actions)):
            graph_data = state.graph_data.to(self.device)
            drone_idx = next(j for j, d in enumerate(state.drones) if d.id == action.drone_id)
            nest_idx = next(j for j, n in enumerate(state.nests) if n.id == action.nest_id)
            
            drone_tensor = torch.tensor([drone_idx], dtype=torch.long, device=self.device)
            nest_tensor = torch.tensor([nest_idx], dtype=torch.long, device=self.device)
            
            q_val = self.q_network(graph_data, drone_tensor, nest_tensor)
            current_q_values.append(q_val)
        
        current_q = torch.cat(current_q_values)
        
        with torch.no_grad():
            next_q_values = []
            for i, next_state in enumerate(next_states):
                if dones[i]:
                    next_q_values.append(torch.tensor([0.0], device=self.device))
                else:
                    graph_data = next_state.graph_data.to(self.device)
                    valid_actions = []
                    for drone in next_state.drones:
                        if not drone.assigned_nest_id:
                            for nest in next_state.nests:
                                if nest.is_available():
                                    valid_actions.append(Action(drone.id, nest.id))
                    
                    if valid_actions:
                        drone_indices = []
                        nest_indices = []
                        for action in valid_actions:
                            drone_idx = next(j for j, d in enumerate(next_state.drones) if d.id == action.drone_id)
                            nest_idx = next(j for j, n in enumerate(next_state.nests) if n.id == action.nest_id)
                            drone_indices.append(drone_idx)
                            nest_indices.append(nest_idx)
                        
                        drone_tensor = torch.tensor(drone_indices, dtype=torch.long, device=self.device)
                        nest_tensor = torch.tensor(nest_indices, dtype=torch.long, device=self.device)
                        
                        q_vals = self.target_network(graph_data, drone_tensor, nest_tensor)
                        next_q_values.append(q_vals.max().unsqueeze(0))
                    else:
                        next_q_values.append(torch.tensor([0.0], device=self.device))
            
            next_q = torch.cat(next_q_values)
            target_q = rewards + self.gamma * next_q * (1 - dones)
        
        loss = F.smooth_l1_loss(current_q, target_q)
        
        self.optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(self.q_network.parameters(), max_norm=1.0)
        self.optimizer.step()
        
        self.steps_done += 1
        
        if self.steps_done % self.target_update_freq == 0:
            self.target_network.load_state_dict(self.q_network.state_dict())
        
        self.epsilon = max(self.epsilon_end, self.epsilon * self.epsilon_decay)
        self.scheduler.step()
        
        return loss.item()
    
    def save(self, path: str):
        torch.save({
            "q_network": self.q_network.state_dict(),
            "target_network": self.target_network.state_dict(),
            "optimizer": self.optimizer.state_dict(),
            "epsilon": self.epsilon,
            "steps_done": self.steps_done,
            "training_history": self.training_history,
        }, path)
    
    def load(self, path: str):
        checkpoint = torch.load(path, map_location=self.device)
        self.q_network.load_state_dict(checkpoint["q_network"])
        self.target_network.load_state_dict(checkpoint["target_network"])
        self.optimizer.load_state_dict(checkpoint["optimizer"])
        self.epsilon = checkpoint["epsilon"]
        self.steps_done = checkpoint["steps_done"]
        self.training_history = checkpoint.get("training_history", [])


class PPOActorCritic(nn.Module):
    
    def __init__(
        self,
        num_drones: int = 50,
        num_nests: int = 20,
        gat_hidden_dim: int = 64,
        actor_hidden_dim: int = 256,
        critic_hidden_dim: int = 256,
    ):
        super().__init__()
        
        self.num_drones = num_drones
        self.num_nests = num_nests
        
        self.gat_encoder = GATEncoder(
            input_dim=32,
            hidden_dim=gat_hidden_dim,
            output_dim=128,
        )
        
        self.drone_encoder = nn.Sequential(
            nn.Linear(128, 64),
            nn.ELU(),
            nn.Linear(64, 32),
        )
        
        self.nest_encoder = nn.Sequential(
            nn.Linear(128, 64),
            nn.ELU(),
            nn.Linear(64, 32),
        )
        
        self.actor = nn.Sequential(
            nn.Linear(32 + 32 + 16, actor_hidden_dim),
            nn.ELU(),
            nn.Dropout(0.1),
            nn.Linear(actor_hidden_dim, actor_hidden_dim // 2),
            nn.ELU(),
        )
        
        self.actor_head = nn.Linear(actor_hidden_dim // 2, 1)
        
        self.critic = nn.Sequential(
            nn.Linear(128, critic_hidden_dim),
            nn.ELU(),
            nn.Dropout(0.1),
            nn.Linear(critic_hidden_dim, critic_hidden_dim // 2),
            nn.ELU(),
            nn.Linear(critic_hidden_dim // 2, 1),
        )
        
        self.context_encoder = nn.Sequential(
            nn.Linear(256, 128),
            nn.ELU(),
            nn.Linear(128, 16),
        )
    
    def forward(self, graph_data: Data):
        node_embeddings = self.gat_encoder(
            graph_data.x,
            graph_data.edge_index,
            graph_data.edge_attr if hasattr(graph_data, 'edge_attr') else None
        )
        
        global_features = torch.mean(node_embeddings, dim=0, keepdim=True)
        value = self.critic(global_features)
        
        return node_embeddings, value
    
    def get_action_probs(
        self,
        node_embeddings: torch.Tensor,
        drone_indices: torch.Tensor,
        nest_indices: torch.Tensor,
    ):
        drone_embeds = self.drone_encoder(node_embeddings[drone_indices])
        nest_embeds = self.nest_encoder(node_embeddings[nest_indices])
        
        global_features = torch.mean(node_embeddings, dim=0)
        context = self.context_encoder(
            torch.cat([global_features, torch.std(node_embeddings, dim=0)])
        )
        context = context.unsqueeze(0).expand(drone_embeds.size(0), -1)
        
        actor_input = torch.cat([drone_embeds, nest_embeds, context], dim=-1)
        actor_features = self.actor(actor_input)
        
        logits = self.actor_head(actor_features).squeeze(-1)
        probs = F.softmax(logits, dim=0)
        
        return probs, logits


class PPOAgent:
    
    def __init__(
        self,
        num_drones: int = 50,
        num_nests: int = 20,
        learning_rate: float = 3e-4,
        gamma: float = 0.99,
        gae_lambda: float = 0.95,
        clip_epsilon: float = 0.2,
        entropy_coef: float = 0.01,
        value_coef: float = 0.5,
        max_grad_norm: float = 0.5,
        update_epochs: int = 4,
        mini_batch_size: int = 32,
        device: str = None,
    ):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        
        self.actor_critic = PPOActorCritic(num_drones, num_nests).to(self.device)
        self.optimizer = optim.Adam(self.actor_critic.parameters(), lr=learning_rate)
        
        self.gamma = gamma
        self.gae_lambda = gae_lambda
        self.clip_epsilon = clip_epsilon
        self.entropy_coef = entropy_coef
        self.value_coef = value_coef
        self.max_grad_norm = max_grad_norm
        self.update_epochs = update_epochs
        self.mini_batch_size = mini_batch_size
        
        self.trajectories = []
        self.training_history = []
    
    def select_action(
        self,
        state: State,
        valid_actions: List[Action],
    ) -> Tuple[Optional[Action], float, float]:
        if not valid_actions:
            return None, 0.0, 0.0
        
        with torch.no_grad():
            graph_data = state.graph_data.to(self.device)
            node_embeddings, value = self.actor_critic(graph_data)
            
            drone_indices = []
            nest_indices = []
            action_map = []
            
            for action in valid_actions:
                drone_idx = next(i for i, d in enumerate(state.drones) if d.id == action.drone_id)
                nest_idx = next(i for i, n in enumerate(state.nests) if n.id == action.nest_id)
                drone_indices.append(drone_idx)
                nest_indices.append(nest_idx)
                action_map.append(action)
            
            drone_tensor = torch.tensor(drone_indices, dtype=torch.long, device=self.device)
            nest_tensor = torch.tensor(nest_indices, dtype=torch.long, device=self.device)
            
            probs, logits = self.actor_critic.get_action_probs(
                node_embeddings, drone_tensor, nest_tensor
            )
            
            dist = torch.distributions.Categorical(probs)
            action_idx = dist.sample()
            
            log_prob = dist.log_prob(action_idx).item()
            value = value.item()
            
            return action_map[action_idx.item()], log_prob, value
    
    def store_transition(
        self,
        state: State,
        action: Action,
        reward: float,
        next_state: State,
        done: bool,
        log_prob: float,
        value: float,
    ):
        self.trajectories.append({
            "state": state,
            "action": action,
            "reward": reward,
            "next_state": next_state,
            "done": done,
            "log_prob": log_prob,
            "value": value,
        })
    
    def compute_gae(self) -> Tuple[torch.Tensor, torch.Tensor]:
        rewards = torch.tensor([t["reward"] for t in self.trajectories], dtype=torch.float32)
        values = torch.tensor([t["value"] for t in self.trajectories], dtype=torch.float32)
        dones = torch.tensor([t["done"] for t in self.trajectories], dtype=torch.float32)
        
        advantages = torch.zeros_like(rewards)
        returns = torch.zeros_like(rewards)
        
        gae = 0
        for t in reversed(range(len(self.trajectories))):
            if t == len(self.trajectories) - 1:
                next_value = 0
            else:
                next_value = values[t + 1]
            
            delta = rewards[t] + self.gamma * next_value * (1 - dones[t]) - values[t]
            gae = delta + self.gamma * self.gae_lambda * (1 - dones[t]) * gae
            
            advantages[t] = gae
            returns[t] = advantages[t] + values[t]
        
        advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)
        
        return advantages, returns
    
    def update(self) -> Dict[str, float]:
        if len(self.trajectories) < self.mini_batch_size:
            return {}
        
        advantages, returns = self.compute_gae()
        
        old_log_probs = torch.tensor(
            [t["log_prob"] for t in self.trajectories], dtype=torch.float32
        )
        
        total_policy_loss = 0
        total_value_loss = 0
        total_entropy = 0
        
        for _ in range(self.update_epochs):
            indices = torch.randperm(len(self.trajectories))
            
            for start in range(0, len(self.trajectories), self.mini_batch_size):
                end = start + self.mini_batch_size
                batch_indices = indices[start:end]
                
                batch_states = [self.trajectories[i]["state"] for i in batch_indices]
                batch_actions = [self.trajectories[i]["action"] for i in batch_indices]
                batch_advantages = advantages[batch_indices].to(self.device)
                batch_returns = returns[batch_indices].to(self.device)
                batch_old_log_probs = old_log_probs[batch_indices].to(self.device)
                
                new_log_probs = []
                new_values = []
                entropies = []
                
                for state, action in zip(batch_states, batch_actions):
                    graph_data = state.graph_data.to(self.device)
                    node_embeddings, value = self.actor_critic(graph_data)
                    
                    drone_idx = next(i for i, d in enumerate(state.drones) if d.id == action.drone_id)
                    nest_idx = next(i for i, n in enumerate(state.nests) if n.id == action.nest_id)
                    
                    valid_actions = []
                    for drone in state.drones:
                        if not drone.assigned_nest_id:
                            for nest in state.nests:
                                if nest.is_available():
                                    valid_actions.append(Action(drone.id, nest.id))
                    
                    if valid_actions:
                        drone_indices = []
                        nest_indices = []
                        action_idx_in_valid = None
                        for idx, act in enumerate(valid_actions):
                            drone_indices.append(
                                next(i for i, d in enumerate(state.drones) if d.id == act.drone_id)
                            )
                            nest_indices.append(
                                next(i for i, n in enumerate(state.nests) if n.id == act.nest_id)
                            )
                            if act.drone_id == action.drone_id and act.nest_id == action.nest_id:
                                action_idx_in_valid = idx
                        
                        drone_tensor = torch.tensor(drone_indices, dtype=torch.long, device=self.device)
                        nest_tensor = torch.tensor(nest_indices, dtype=torch.long, device=self.device)
                        
                        probs, logits = self.actor_critic.get_action_probs(
                            node_embeddings, drone_tensor, nest_tensor
                        )
                        
                        dist = torch.distributions.Categorical(probs)
                        
                        if action_idx_in_valid is not None:
                            new_log_probs.append(dist.log_prob(torch.tensor(action_idx_in_valid)))
                        else:
                            new_log_probs.append(torch.tensor(0.0, device=self.device))
                        
                        entropies.append(dist.entropy())
                    
                    new_values.append(value)
                
                new_log_probs = torch.stack(new_log_probs)
                new_values = torch.stack(new_values).squeeze()
                entropy = torch.stack(entropies).mean()
                
                ratio = torch.exp(new_log_probs - batch_old_log_probs)
                surr1 = ratio * batch_advantages
                surr2 = torch.clamp(ratio, 1 - self.clip_epsilon, 1 + self.clip_epsilon) * batch_advantages
                policy_loss = -torch.min(surr1, surr2).mean()
                
                value_loss = F.mse_loss(new_values, batch_returns)
                
                loss = (
                    policy_loss
                    + self.value_coef * value_loss
                    - self.entropy_coef * entropy
                )
                
                self.optimizer.zero_grad()
                loss.backward()
                torch.nn.utils.clip_grad_norm_(
                    self.actor_critic.parameters(), self.max_grad_norm
                )
                self.optimizer.step()
                
                total_policy_loss += policy_loss.item()
                total_value_loss += value_loss.item()
                total_entropy += entropy.item()
        
        num_updates = self.update_epochs * (len(self.trajectories) // self.mini_batch_size)
        
        metrics = {
            "policy_loss": total_policy_loss / num_updates,
            "value_loss": total_value_loss / num_updates,
            "entropy": total_entropy / num_updates,
        }
        
        self.trajectories = []
        
        return metrics
    
    def save(self, path: str):
        torch.save({
            "actor_critic": self.actor_critic.state_dict(),
            "optimizer": self.optimizer.state_dict(),
            "training_history": self.training_history,
        }, path)
    
    def load(self, path: str):
        checkpoint = torch.load(path, map_location=self.device)
        self.actor_critic.load_state_dict(checkpoint["actor_critic"])
        self.optimizer.load_state_dict(checkpoint["optimizer"])
        self.training_history = checkpoint.get("training_history", [])
