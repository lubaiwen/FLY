import os
import json
import numpy as np
import torch
from torch_geometric.data import Data, DataLoader
from typing import List, Dict, Tuple, Optional, Generator
from pathlib import Path
from datetime import datetime
import random

from simulation import DataSimulator, CityEnvironment, DroneFactory
from models import Drone, Nest, Position, DroneStatus
from models.gat_model import SpatialTemporalGraphBuilder
from config import settings, DroneType, TaskPriority


class TrainingDataGenerator:
    
    def __init__(
        self,
        output_dir: str = "data/training",
        num_episodes: int = 1000,
        episode_length: int = 500,
    ):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        self.num_episodes = num_episodes
        self.episode_length = episode_length
        
        self.graph_builder = SpatialTemporalGraphBuilder()
        
        self.environment = CityEnvironment(
            center_lat=settings.city.center_lat,
            center_lon=settings.city.center_lon,
            num_nests=50,
        )
        self.environment.generate_grid()
        self.nests = self.environment.generate_nests(50)
        
        self.drones, self.behaviors = DroneFactory.create_fleet(
            num_fixed_route=30,
            num_periodic=40,
            num_emergency=30,
        )
    
    def generate_episode(self) -> Dict:
        episode_data = {
            "states": [],
            "actions": [],
            "rewards": [],
            "next_states": [],
            "dones": [],
            "metadata": {
                "episode_length": 0,
                "total_reward": 0,
                "num_matchings": 0,
            }
        }
        
        for drone in self.drones:
            drone.energy = drone.max_energy
            drone.status = DroneStatus.IDLE
            drone.assigned_nest_id = None
        
        for nest in self.nests:
            for slot in nest.slots:
                slot.is_occupied = False
                slot.drone_id = None
        
        total_reward = 0
        num_matchings = 0
        
        for step in range(self.episode_length):
            state_data = self._capture_state()
            
            action = self._select_action()
            
            reward, matching_made = self._execute_action(action)
            
            next_state_data = self._capture_state()
            
            done = (step == self.episode_length - 1)
            
            episode_data["states"].append(state_data)
            episode_data["actions"].append(action)
            episode_data["rewards"].append(reward)
            episode_data["next_states"].append(next_state_data)
            episode_data["dones"].append(done)
            
            total_reward += reward
            if matching_made:
                num_matchings += 1
            
            self._update_simulation()
        
        episode_data["metadata"]["episode_length"] = self.episode_length
        episode_data["metadata"]["total_reward"] = total_reward
        episode_data["metadata"]["num_matchings"] = num_matchings
        
        return episode_data
    
    def _capture_state(self) -> Dict:
        graph_data = self.graph_builder.build_graph(self.drones, self.nests)
        
        return {
            "drones": [(d.id, d.position.lat, d.position.lon, d.energy, d.status.value, d.task_priority) 
                      for d in self.drones],
            "nests": [(n.id, n.position.lat, n.position.lon, n.available_slots(), n.capacity, n.demand_density)
                     for n in self.nests],
            "graph_x": graph_data.x.numpy().tolist() if graph_data.x is not None else [],
            "graph_edge_index": graph_data.edge_index.numpy().tolist() if graph_data.edge_index is not None else [],
        }
    
    def _select_action(self) -> Dict:
        candidates = []
        
        for drone in self.drones:
            if drone.assigned_nest_id:
                continue
            
            if drone.remaining_energy_ratio() < 0.3:
                for nest in self.nests:
                    if nest.is_available():
                        distance = drone.position.distance_to(nest.position)
                        energy_needed = distance * drone.energy_consumption_rate
                        
                        if drone.energy >= energy_needed:
                            score = self._calculate_heuristic_score(drone, nest, distance)
                            candidates.append({
                                "drone_id": drone.id,
                                "nest_id": nest.id,
                                "score": score,
                            })
        
        if candidates:
            candidates.sort(key=lambda x: x["score"], reverse=True)
            best = candidates[0]
            return {
                "drone_id": best["drone_id"],
                "nest_id": best["nest_id"],
            }
        
        return {"drone_id": None, "nest_id": None}
    
    def _calculate_heuristic_score(self, drone: Drone, nest: Nest, distance: float) -> float:
        energy_score = drone.energy / drone.max_energy
        
        distance_score = 1.0 - (distance / 10000)
        
        priority_score = drone.task_priority / 2.0
        
        demand_score = nest.demand_density
        
        availability_score = nest.available_slots() / nest.capacity
        
        return (
            0.3 * energy_score +
            0.2 * distance_score +
            0.2 * priority_score +
            0.15 * demand_score +
            0.15 * availability_score
        )
    
    def _execute_action(self, action: Dict) -> Tuple[float, bool]:
        if action["drone_id"] is None or action["nest_id"] is None:
            return -0.1, False
        
        drone = next((d for d in self.drones if d.id == action["drone_id"]), None)
        nest = next((n for n in self.nests if n.id == action["nest_id"]), None)
        
        if not drone or not nest:
            return -0.5, False
        
        if not nest.is_available():
            return -0.3, False
        
        distance = drone.position.distance_to(nest.position)
        energy_cost = distance * drone.energy_consumption_rate
        
        if drone.energy < energy_cost:
            return -0.4, False
        
        slot_idx = nest.occupy_slot(drone.id)
        if slot_idx is None:
            return -0.3, False
        
        drone.assigned_nest_id = nest.id
        drone.energy -= energy_cost
        
        reward = self._calculate_reward(drone, nest, distance, energy_cost)
        
        return reward, True
    
    def _calculate_reward(
        self,
        drone: Drone,
        nest: Nest,
        distance: float,
        energy_cost: float,
    ) -> float:
        energy_efficiency = 1.0 - (energy_cost / drone.max_energy)
        
        matching_quality = nest.demand_density * (1.0 + drone.task_priority)
        
        load_balance = nest.available_slots() / nest.capacity
        
        emergency_bonus = 1.5 if drone.task_priority >= TaskPriority.EMERGENCY.value else 1.0
        
        reward = (
            0.4 * energy_efficiency +
            0.3 * matching_quality +
            0.2 * load_balance
        ) * emergency_bonus
        
        return reward
    
    def _update_simulation(self):
        for drone in self.drones:
            if drone.assigned_nest_id:
                nest = next((n for n in self.nests if n.id == drone.assigned_nest_id), None)
                if nest:
                    distance = drone.position.distance_to(nest.position)
                    if distance < 50:
                        drone.energy = min(drone.max_energy, drone.energy + 500)
                        if drone.energy >= drone.max_energy * 0.9:
                            for slot in nest.slots:
                                if slot.drone_id == drone.id:
                                    nest.release_slot(slot.slot_id)
                                    break
                            drone.assigned_nest_id = None
            else:
                energy_drain = random.uniform(0.1, 0.5)
                drone.energy = max(0, drone.energy - energy_drain)
                
                if drone.remaining_energy_ratio() < 0.2:
                    drone.status = DroneStatus.EMERGENCY
    
    def generate_dataset(self) -> str:
        all_episodes = []
        
        print(f"Generating {self.num_episodes} episodes...")
        
        for episode_idx in range(self.num_episodes):
            if episode_idx % 100 == 0:
                print(f"  Episode {episode_idx}/{self.num_episodes}")
            
            episode = self.generate_episode()
            all_episodes.append(episode)
            
            for drone in self.drones:
                drone.energy = drone.max_energy
                drone.status = DroneStatus.IDLE
                drone.assigned_nest_id = None
            
            for nest in self.nests:
                for slot in nest.slots:
                    slot.is_occupied = False
                    slot.drone_id = None
        
        output_file = self.output_dir / f"training_data_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(all_episodes, f)
        
        print(f"Dataset saved to {output_file}")
        
        return str(output_file)


class GraphDataset(torch.utils.data.Dataset):
    
    def __init__(
        self,
        data_path: str = None,
        episodes: List[Dict] = None,
    ):
        if episodes:
            self.episodes = episodes
        elif data_path:
            with open(data_path, "r", encoding="utf-8") as f:
                self.episodes = json.load(f)
        else:
            self.episodes = []
        
        self.samples = self._prepare_samples()
    
    def _prepare_samples(self) -> List[Dict]:
        samples = []
        
        for episode in self.episodes:
            states = episode["states"]
            actions = episode["actions"]
            rewards = episode["rewards"]
            next_states = episode["next_states"]
            dones = episode["dones"]
            
            for i in range(len(states)):
                sample = {
                    "state": states[i],
                    "action": actions[i],
                    "reward": rewards[i],
                    "next_state": next_states[i],
                    "done": dones[i],
                }
                samples.append(sample)
        
        return samples
    
    def __len__(self):
        return len(self.samples)
    
    def __getitem__(self, idx):
        sample = self.samples[idx]
        
        state_graph = self._create_graph(sample["state"])
        next_state_graph = self._create_graph(sample["next_state"])
        
        return {
            "state_graph": state_graph,
            "action": sample["action"],
            "reward": sample["reward"],
            "next_state_graph": next_state_graph,
            "done": sample["done"],
        }
    
    def _create_graph(self, state_data: Dict) -> Data:
        if state_data.get("graph_x"):
            x = torch.tensor(state_data["graph_x"], dtype=torch.float)
            edge_index = torch.tensor(state_data["graph_edge_index"], dtype=torch.long)
            return Data(x=x, edge_index=edge_index)
        
        return Data(x=torch.zeros((0, 32)), edge_index=torch.zeros((2, 0), dtype=torch.long))


def create_dataloader(
    data_path: str = None,
    episodes: List[Dict] = None,
    batch_size: int = 32,
    shuffle: bool = True,
) -> torch.utils.data.DataLoader:
    dataset = GraphDataset(data_path=data_path, episodes=episodes)
    return torch.utils.data.DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=shuffle,
        collate_fn=custom_collate,
    )


def custom_collate(batch):
    return {
        "state_graphs": [item["state_graph"] for item in batch],
        "actions": [item["action"] for item in batch],
        "rewards": torch.tensor([item["reward"] for item in batch], dtype=torch.float),
        "next_state_graphs": [item["next_state_graph"] for item in batch],
        "dones": torch.tensor([item["done"] for item in batch], dtype=torch.float),
    }
