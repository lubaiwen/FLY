import os
import sys
import json
import argparse
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional
import time

import torch
import torch.nn.functional as F
import numpy as np
import matplotlib.pyplot as plt
from tqdm import tqdm

from training.rl_environment import DroneSchedulingEnv, State, Action, Transition
from training.rl_algorithms import DQNAgent, PPOAgent
from training.data_pipeline import TrainingDataGenerator, GraphDataset, create_dataloader
from training.real_world_env import RealWorldSchedulingEnv
from config import settings


class Trainer:
    
    def __init__(
        self,
        algorithm: str = "dqn",
        num_drones: int = 50,
        num_nests: int = 20,
        num_episodes: int = 1000,
        max_steps_per_episode: int = 500,
        learning_rate: float = 1e-4,
        gamma: float = 0.99,
        save_dir: str = "models/checkpoints",
        log_dir: str = "logs",
        device: str = None,
        use_real_data: bool = False,
        city: str = "合肥",
        amap_api_key: str = None,
    ):
        self.algorithm = algorithm.lower()
        self.num_episodes = num_episodes
        self.max_steps_per_episode = max_steps_per_episode
        self.save_dir = Path(save_dir)
        self.log_dir = Path(log_dir)
        self.save_dir.mkdir(parents=True, exist_ok=True)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        print(f"Using device: {self.device}")
        
        if use_real_data:
            print(f"Using real-world data from {city}")
            self.env = RealWorldSchedulingEnv(
                city=city,
                amap_api_key=amap_api_key,
                num_drones=num_drones,
                num_nests=num_nests,
                max_steps=max_steps_per_episode,
                use_real_data=True,
            )
        else:
            self.env = DroneSchedulingEnv(
                num_drones=num_drones,
                num_nests=num_nests,
            max_steps=max_steps_per_episode,
        )
        
        if self.algorithm == "dqn":
            self.agent = DQNAgent(
                num_drones=num_drones,
                num_nests=num_nests,
                learning_rate=learning_rate,
                gamma=gamma,
                device=self.device,
            )
        elif self.algorithm == "ppo":
            self.agent = PPOAgent(
                num_drones=num_drones,
                num_nests=num_nests,
                learning_rate=learning_rate,
                gamma=gamma,
                device=self.device,
            )
        else:
            raise ValueError(f"Unknown algorithm: {algorithm}")
        
        self.training_history = {
            "episode_rewards": [],
            "episode_lengths": [],
            "episode_matchings": [],
            "losses": [],
            "epsilon": [],
            "avg_q_values": [],
        }
        
        self.best_reward = float("-inf")
    
    def train(self):
        print(f"\nStarting {self.algorithm.upper()} training...")
        print(f"Episodes: {self.num_episodes}")
        print(f"Max steps per episode: {self.max_steps_per_episode}")
        
        start_time = time.time()
        
        for episode in range(self.num_episodes):
            state = self.env.reset()
            episode_reward = 0
            episode_matchings = 0
            
            for step in range(self.max_steps_per_episode):
                valid_actions = self.env.get_valid_actions()
                
                if not valid_actions:
                    break
                
                if self.algorithm == "dqn":
                    action = self.agent.select_action(state, valid_actions, explore=True)
                else:
                    action, log_prob, value = self.agent.select_action(state, valid_actions)
                
                if action is None:
                    continue
                
                next_state, reward, done, info = self.env.step(action)
                episode_reward += reward
                
                if info.get("matchings", 0) > 0:
                    episode_matchings += 1
                
                if self.algorithm == "dqn":
                    transition = Transition(
                        state=state,
                        action=action,
                        reward=reward,
                        next_state=next_state,
                        done=done,
                    )
                    self.agent.store_transition(transition)
                    
                    loss = self.agent.train_step()
                    if loss is not None:
                        self.training_history["losses"].append(loss)
                else:
                    self.agent.store_transition(
                        state, action, reward, next_state, done, log_prob, value
                    )
                
                state = next_state
                
                if done:
                    break
            
            if self.algorithm == "ppo":
                metrics = self.agent.update()
                if metrics:
                    self.training_history["losses"].append(metrics.get("policy_loss", 0))
            
            self.training_history["episode_rewards"].append(episode_reward)
            self.training_history["episode_lengths"].append(step + 1)
            self.training_history["episode_matchings"].append(episode_matchings)
            
            if self.algorithm == "dqn":
                self.training_history["epsilon"].append(self.agent.epsilon)
            
            if episode_reward > self.best_reward:
                self.best_reward = episode_reward
                self._save_checkpoint("best_model.pt")
            
            if (episode + 1) % 50 == 0:
                avg_reward = np.mean(self.training_history["episode_rewards"][-50:])
                avg_matchings = np.mean(self.training_history["episode_matchings"][-50:])
                elapsed = time.time() - start_time
                
                print(f"Episode {episode + 1}/{self.num_episodes} | "
                      f"Avg Reward: {avg_reward:.2f} | "
                      f"Avg Matchings: {avg_matchings:.1f} | "
                      f"Epsilon: {self.agent.epsilon:.3f}" if self.algorithm == "dqn" else ""
                      f"Time: {elapsed:.1f}s")
            
            if (episode + 1) % 100 == 0:
                self._save_checkpoint(f"checkpoint_ep{episode + 1}.pt")
        
        self._save_checkpoint("final_model.pt")
        self._save_training_history()
        self._plot_training_curves()
        
        total_time = time.time() - start_time
        print(f"\nTraining completed in {total_time:.2f}s")
        print(f"Best reward: {self.best_reward:.2f}")
        
        return self.training_history
    
    def _save_checkpoint(self, filename: str):
        path = self.save_dir / filename
        self.agent.save(str(path))
        print(f"Saved checkpoint: {path}")
    
    def _save_training_history(self):
        path = self.log_dir / "training_history.json"
        
        history_serializable = {
            k: [float(x) for x in v] if isinstance(v, list) else v
            for k, v in self.training_history.items()
        }
        
        with open(path, "w", encoding="utf-8") as f:
            json.dump(history_serializable, f, indent=2)
        
        print(f"Saved training history: {path}")
    
    def _plot_training_curves(self):
        fig, axes = plt.subplots(2, 2, figsize=(14, 10))
        
        ax1 = axes[0, 0]
        rewards = self.training_history["episode_rewards"]
        ax1.plot(rewards, alpha=0.6, label="Episode Reward")
        window = min(50, len(rewards))
        if window > 1:
            moving_avg = np.convolve(rewards, np.ones(window)/window, mode='valid')
            ax1.plot(range(window-1, len(rewards)), moving_avg, 'r-', linewidth=2, label=f"Moving Avg ({window})")
        ax1.set_xlabel("Episode")
        ax1.set_ylabel("Reward")
        ax1.set_title("Episode Rewards")
        ax1.legend()
        ax1.grid(True, alpha=0.3)
        
        ax2 = axes[0, 1]
        matchings = self.training_history["episode_matchings"]
        ax2.plot(matchings, alpha=0.6)
        ax2.set_xlabel("Episode")
        ax2.set_ylabel("Number of Matchings")
        ax2.set_title("Matchings per Episode")
        ax2.grid(True, alpha=0.3)
        
        ax3 = axes[1, 0]
        losses = self.training_history["losses"]
        if losses:
            ax3.plot(losses, alpha=0.6)
            ax3.set_xlabel("Training Step")
            ax3.set_ylabel("Loss")
            ax3.set_title("Training Loss")
            ax3.grid(True, alpha=0.3)
        
        ax4 = axes[1, 1]
        if self.algorithm == "dqn" and self.training_history["epsilon"]:
            epsilon = self.training_history["epsilon"]
            ax4.plot(epsilon)
            ax4.set_xlabel("Episode")
            ax4.set_ylabel("Epsilon")
            ax4.set_title("Exploration Rate (Epsilon)")
            ax4.grid(True, alpha=0.3)
        else:
            lengths = self.training_history["episode_lengths"]
            ax4.plot(lengths, alpha=0.6)
            ax4.set_xlabel("Episode")
            ax4.set_ylabel("Steps")
            ax4.set_title("Episode Lengths")
            ax4.grid(True, alpha=0.3)
        
        plt.tight_layout()
        
        plot_path = self.log_dir / "training_curves.png"
        plt.savefig(plot_path, dpi=150, bbox_inches='tight')
        plt.close()
        
        print(f"Saved training curves: {plot_path}")


class Evaluator:
    
    def __init__(
        self,
        agent_path: str,
        algorithm: str = "dqn",
        num_drones: int = 50,
        num_nests: int = 20,
        num_episodes: int = 100,
        device: str = None,
    ):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        
        self.env = DroneSchedulingEnv(
            num_drones=num_drones,
            num_nests=num_nests,
        )
        
        if algorithm.lower() == "dqn":
            self.agent = DQNAgent(
                num_drones=num_drones,
                num_nests=num_nests,
                device=self.device,
            )
        else:
            self.agent = PPOAgent(
                num_drones=num_drones,
                num_nests=num_nests,
                device=self.device,
            )
        
        self.agent.load(agent_path)
        if hasattr(self.agent, "epsilon"):
            self.agent.epsilon = 0.0
        
        self.num_episodes = num_episodes
    
    def evaluate(self) -> Dict:
        print(f"\nEvaluating model over {self.num_episodes} episodes...")
        
        rewards = []
        matchings = []
        energy_efficiencies = []
        
        for episode in tqdm(range(self.num_episodes)):
            state = self.env.reset()
            episode_reward = 0
            episode_matchings = 0
            initial_energy = sum(d.energy for d in self.env.drones)
            
            for step in range(self.env.max_steps):
                valid_actions = self.env.get_valid_actions()
                
                if not valid_actions:
                    break
                
                if hasattr(self.agent, "select_action"):
                    if "log_prob" in str(self.agent.select_action.__code__.co_varnames):
                        action, _, _ = self.agent.select_action(state, valid_actions)
                    else:
                        action = self.agent.select_action(state, valid_actions, explore=False)
                else:
                    action = random.choice(valid_actions)
                
                if action is None:
                    continue
                
                next_state, reward, done, info = self.env.step(action)
                episode_reward += reward
                
                if info.get("matchings", 0) > 0:
                    episode_matchings += 1
                
                state = next_state
                
                if done:
                    break
            
            final_energy = sum(d.energy for d in self.env.drones)
            energy_efficiency = (initial_energy - final_energy) / initial_energy if initial_energy > 0 else 0
            
            rewards.append(episode_reward)
            matchings.append(episode_matchings)
            energy_efficiencies.append(energy_efficiency)
        
        results = {
            "avg_reward": np.mean(rewards),
            "std_reward": np.std(rewards),
            "avg_matchings": np.mean(matchings),
            "std_matchings": np.std(matchings),
            "avg_energy_efficiency": np.mean(energy_efficiencies),
            "min_reward": np.min(rewards),
            "max_reward": np.max(rewards),
        }
        
        print("\nEvaluation Results:")
        print(f"  Average Reward: {results['avg_reward']:.2f} ± {results['std_reward']:.2f}")
        print(f"  Average Matchings: {results['avg_matchings']:.1f} ± {results['std_matchings']:.1f}")
        print(f"  Average Energy Efficiency: {results['avg_energy_efficiency']:.2%}")
        print(f"  Min/Max Reward: {results['min_reward']:.2f} / {results['max_reward']:.2f}")
        
        return results


def main():
    parser = argparse.ArgumentParser(description="Train GAT-based RL agent for drone scheduling")
    
    parser.add_argument("--algorithm", type=str, default="dqn", choices=["dqn", "ppo"],
                        help="RL algorithm to use")
    parser.add_argument("--num-drones", type=int, default=50,
                        help="Number of drones in simulation")
    parser.add_argument("--num-nests", type=int, default=20,
                        help="Number of nests in simulation")
    parser.add_argument("--num-episodes", type=int, default=1000,
                        help="Number of training episodes")
    parser.add_argument("--max-steps", type=int, default=500,
                        help="Maximum steps per episode")
    parser.add_argument("--lr", type=float, default=1e-4,
                        help="Learning rate")
    parser.add_argument("--gamma", type=float, default=0.99,
                        help="Discount factor")
    parser.add_argument("--save-dir", type=str, default="models/checkpoints",
                        help="Directory to save checkpoints")
    parser.add_argument("--log-dir", type=str, default="logs",
                        help="Directory to save logs")
    parser.add_argument("--device", type=str, default=None,
                        help="Device to use (cuda/cpu)")
    parser.add_argument("--eval-only", action="store_true",
                        help="Only evaluate, no training")
    parser.add_argument("--model-path", type=str, default=None,
                        help="Path to model for evaluation")
    parser.add_argument("--use-real-data", action="store_true",
                        help="Use real-world data from Amap API")
    parser.add_argument("--city", type=str, default="合肥",
                        help="City name for real-world data")
    parser.add_argument("--amap-api-key", type=str, default=None,
                        help="Amap API key for real-world data")
    
    args = parser.parse_args()
    
    if args.eval_only:
        if not args.model_path:
            print("Error: --model-path required for evaluation")
            return
        
        evaluator = Evaluator(
            agent_path=args.model_path,
            algorithm=args.algorithm,
            num_drones=args.num_drones,
            num_nests=args.num_nests,
            device=args.device,
        )
        evaluator.evaluate()
    else:
        trainer = Trainer(
            algorithm=args.algorithm,
            num_drones=args.num_drones,
            num_nests=args.num_nests,
            num_episodes=args.num_episodes,
            max_steps_per_episode=args.max_steps,
            learning_rate=args.lr,
            gamma=args.gamma,
            save_dir=args.save_dir,
            log_dir=args.log_dir,
            device=args.device,
            use_real_data=args.use_real_data,
            city=args.city,
            amap_api_key=args.amap_api_key,
        )
        
        trainer.train()


if __name__ == "__main__":
    main()
