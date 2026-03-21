import numpy as np
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime

from config import settings, TaskPriority
from models import Drone, Nest, Position


@dataclass
class AdvantageComponents:
    travel_time: float
    time_decay: float
    future_value: float
    current_value: float
    remaining_energy: float
    task_emergency: float
    instant_reward: float
    total_advantage: float


class AdvantageFunction:
    
    def __init__(
        self,
        gamma: float = None,
        alpha: float = None,
        beta: float = None,
        time_decay_factor: float = None,
    ):
        self.gamma = gamma or settings.advantage_function.gamma
        self.alpha = alpha or settings.advantage_function.alpha
        self.beta = beta or settings.advantage_function.beta
        self.time_decay_factor = time_decay_factor or settings.advantage_function.time_decay_factor
        
        self.future_value_predictor = None
    
    def set_future_value_predictor(self, predictor):
        self.future_value_predictor = predictor
    
    def calculate(
        self,
        drone: Drone,
        nest: Nest,
        travel_time: float = None,
        distance: float = None,
    ) -> AdvantageComponents:
        if distance is None:
            distance = drone.position.distance_to(nest.position)
        
        if travel_time is None:
            travel_time = distance / drone.speed
        
        remaining_energy = self._calculate_remaining_energy(drone, distance)
        
        task_emergency = self._get_task_emergency_coefficient(drone)
        
        instant_reward = self._calculate_instant_reward(
            remaining_energy, task_emergency
        )
        
        time_decay = self.gamma ** travel_time
        
        future_value = self._predict_future_value(drone, nest, travel_time)
        
        current_value = self._calculate_current_value(drone)
        
        advantage = (
            time_decay * future_value - current_value + instant_reward
        )
        
        return AdvantageComponents(
            travel_time=travel_time,
            time_decay=time_decay,
            future_value=future_value,
            current_value=current_value,
            remaining_energy=remaining_energy,
            task_emergency=task_emergency,
            instant_reward=instant_reward,
            total_advantage=advantage,
        )
    
    def _calculate_remaining_energy(self, drone: Drone, distance: float) -> float:
        energy_consumed = distance * drone.energy_consumption_rate
        return drone.energy - energy_consumed
    
    def _get_task_emergency_coefficient(self, drone: Drone) -> float:
        task_priority_map = {
            TaskPriority.EMERGENCY.value: 1.8,
            TaskPriority.PERIODIC.value: 1.0,
            TaskPriority.FIXED.value: 0.6,
        }
        
        base_coefficient = task_priority_map.get(drone.task_priority, 1.0)
        
        if drone.remaining_energy_ratio() < 0.2:
            base_coefficient *= 1.5
        
        return base_coefficient
    
    def _calculate_instant_reward(
        self,
        remaining_energy: float,
        task_emergency: float,
    ) -> float:
        return self.alpha * remaining_energy + self.beta * task_emergency
    
    def _predict_future_value(
        self,
        drone: Drone,
        nest: Nest,
        travel_time: float,
    ) -> float:
        if self.future_value_predictor is not None:
            try:
                return self.future_value_predictor.predict(drone, nest, travel_time)
            except Exception:
                pass
        
        return self._heuristic_future_value(nest)
    
    def _heuristic_future_value(self, nest: Nest) -> float:
        base_value = nest.demand_density * 100
        
        availability_bonus = (nest.available_slots() / nest.capacity) * 50
        
        usage_factor = nest.historical_usage_rate * 30
        
        return base_value + availability_bonus + usage_factor
    
    def _calculate_current_value(self, drone: Drone) -> float:
        return drone.remaining_energy_ratio() * 50


class AdvantageMatrixBuilder:
    
    def __init__(self, advantage_function: AdvantageFunction = None):
        self.advantage_function = advantage_function or AdvantageFunction()
    
    def build_matrix(
        self,
        drones: List[Drone],
        nests: List[Nest],
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        n_drones = len(drones)
        n_nests = len(nests)
        
        advantage_matrix = np.zeros((n_drones, n_nests))
        travel_time_matrix = np.zeros((n_drones, n_nests))
        energy_cost_matrix = np.zeros((n_drones, n_nests))
        
        for i, drone in enumerate(drones):
            for j, nest in enumerate(nests):
                distance = drone.position.distance_to(nest.position)
                travel_time = distance / drone.speed
                
                components = self.advantage_function.calculate(
                    drone, nest, travel_time, distance
                )
                
                advantage_matrix[i, j] = components.total_advantage
                travel_time_matrix[i, j] = travel_time
                energy_cost_matrix[i, j] = distance * drone.energy_consumption_rate
        
        return advantage_matrix, travel_time_matrix, energy_cost_matrix
    
    def build_matrix_batch(
        self,
        drones: List[Drone],
        nests: List[Nest],
        batch_size: int = 50,
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        n_drones = len(drones)
        n_nests = len(nests)
        
        advantage_matrix = np.zeros((n_drones, n_nests))
        travel_time_matrix = np.zeros((n_drones, n_nests))
        energy_cost_matrix = np.zeros((n_drones, n_nests))
        
        for start in range(0, n_drones, batch_size):
            end = min(start + batch_size, n_drones)
            batch_drones = drones[start:end]
            
            for i_offset, drone in enumerate(batch_drones):
                i = start + i_offset
                for j, nest in enumerate(nests):
                    distance = drone.position.distance_to(nest.position)
                    travel_time = distance / drone.speed
                    
                    components = self.advantage_function.calculate(
                        drone, nest, travel_time, distance
                    )
                    
                    advantage_matrix[i, j] = components.total_advantage
                    travel_time_matrix[i, j] = travel_time
                    energy_cost_matrix[i, j] = distance * drone.energy_consumption_rate
        
        return advantage_matrix, travel_time_matrix, energy_cost_matrix


class EnergyCalculator:
    
    @staticmethod
    def calculate_travel_energy(drone: Drone, distance: float) -> float:
        return distance * drone.energy_consumption_rate
    
    @staticmethod
    def calculate_charging_time(drone: Drone, charging_power: float) -> float:
        energy_needed = drone.max_energy - drone.energy
        return energy_needed / charging_power
    
    @staticmethod
    def calculate_total_energy_cost(
        drone: Drone,
        nest: Nest,
        return_distance: float = None,
    ) -> float:
        distance_to_nest = drone.position.distance_to(nest.position)
        energy_to_nest = distance_to_nest * drone.energy_consumption_rate
        
        if return_distance is None:
            return_distance = distance_to_nest
        
        energy_return = return_distance * drone.energy_consumption_rate
        
        return energy_to_nest + energy_return
    
    @staticmethod
    def calculate_energy_savings(
        drone: Drone,
        greedy_distance: float,
        optimal_distance: float,
    ) -> float:
        greedy_energy = greedy_distance * drone.energy_consumption_rate
        optimal_energy = optimal_distance * drone.energy_consumption_rate
        
        return greedy_energy - optimal_energy


class PriorityHandler:
    
    PRIORITY_LEVELS = {
        TaskPriority.EMERGENCY.value: 3,
        TaskPriority.PERIODIC.value: 2,
        TaskPriority.FIXED.value: 1,
    }
    
    @classmethod
    def adjust_advantage_by_priority(
        cls,
        advantage: float,
        drone: Drone,
        nest: Nest,
    ) -> float:
        priority_level = cls.PRIORITY_LEVELS.get(drone.task_priority, 1)
        
        if drone.remaining_energy_ratio() < 0.15:
            priority_level += 1
        
        if nest.region_type == "emergency":
            priority_level += 0.5
        
        multiplier = 1.0 + (priority_level - 1) * 0.3
        
        return advantage * multiplier
    
    @classmethod
    def sort_by_priority(
        cls,
        drones: List[Drone],
    ) -> List[Drone]:
        return sorted(
            drones,
            key=lambda d: cls.PRIORITY_LEVELS.get(d.task_priority, 1),
            reverse=True,
        )
    
    @classmethod
    def get_high_priority_drones(
        cls,
        drones: List[Drone],
        threshold: float = TaskPriority.PERIODIC.value,
    ) -> List[Drone]:
        return [
            d for d in drones
            if d.task_priority >= threshold
        ]
