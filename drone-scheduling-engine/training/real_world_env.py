import numpy as np
import torch
from torch_geometric.data import Data
from typing import List, Dict, Tuple, Optional, Any
from dataclasses import dataclass
from datetime import datetime
import random

from models import Drone, Nest, Position, DroneStatus, NestSlot, NestStatus
from models.gat_model import SpatialTemporalGraphBuilder
from training.rl_environment import State, Action, Transition, ReplayBuffer
from config import settings
from data.amap_integration import RealWorldEnvironment, AmapAPI
from data.geo_parser import UrbanEnvironmentBuilder, UrbanEnvironment3D, RealWorldTrainingAdapter


class RealWorldSchedulingEnv:
    
    def __init__(
        self,
        city: str = "合肥",
        amap_api_key: str = None,
        num_drones: int = 50,
        num_nests: int = 20,
        max_steps: int = 1000,
        use_real_data: bool = True,
        reward_weights: Dict[str, float] = None,
    ):
        self.city = city
        self.num_drones = num_drones
        self.num_nests = num_nests
        self.max_steps = max_steps
        self.use_real_data = use_real_data
        self.current_step = 0
        
        self.reward_weights = reward_weights or {
            "energy_efficiency": 1.0,
            "matching_quality": 0.5,
            "emergency_priority": 2.0,
            "load_balance": 0.3,
            "weather_penalty": -0.2,
            "obstacle_avoidance": 0.4,
            "timeout_penalty": -0.5,
        }
        
        self.graph_builder = SpatialTemporalGraphBuilder()
        
        self.drones: List[Drone] = []
        self.nests: List[Nest] = []
        self.matchings: Dict[str, str] = {}
        
        self.urban_environment: Optional[UrbanEnvironment3D] = None
        self.training_adapter: Optional[RealWorldTrainingAdapter] = None
        
        self._init_environment()
        
        self.action_space = num_drones * num_nests
        self.observation_dim = settings.gat.input_dim
    
    def _init_environment(self):
        if self.use_real_data:
            try:
                print(f"正在加载 {self.city} 的真实地理数据...")
                
                builder = UrbanEnvironmentBuilder(city=self.city)
                self.urban_environment = builder.build_environment(
                    num_nests=self.num_nests,
                    grid_resolution=20,
                    altitude_levels=5,
                )
                
                self.training_adapter = RealWorldTrainingAdapter(self.urban_environment)
                
                self._create_nests_from_real_data()
                
                print(f"成功加载 {len(self.nests)} 个真实机槽位置")
                
            except Exception as e:
                print(f"加载真实数据失败: {e}, 使用模拟数据")
                self._init_simulated_environment()
        else:
            self._init_simulated_environment()
        
        self._create_drones()
    
    def _init_simulated_environment(self):
        from simulation import CityEnvironment, DroneFactory
        
        city_env = CityEnvironment(
            center_lat=settings.city.center_lat,
            center_lon=settings.city.center_lon,
            num_nests=self.num_nests,
        )
        city_env.generate_grid()
        self.nests = city_env.generate_nests(self.num_nests)
    
    def _create_nests_from_real_data(self):
        self.nests = []
        
        for i, corridor in enumerate(self.urban_environment.flight_corridors[:self.num_nests]):
            nest = Nest(
                id=f"NEST-{i+1:04d}",
                name=f"真实机槽-{i+1}",
                position=Position(
                    lat=corridor.start[0],
                    lon=corridor.start[1],
                    altitude=corridor.min_altitude,
                ),
                capacity=random.choice([4, 6, 8]),
                status=NestStatus.AVAILABLE,
                region_type=self._determine_region_type(corridor.start),
                demand_density=random.uniform(0.3, 0.9),
                historical_usage_rate=random.uniform(0.2, 0.7),
            )
            self.nests.append(nest)
    
    def _determine_region_type(self, location: Tuple[float, float]) -> str:
        for building in self.urban_environment.buildings:
            dist = np.sqrt(
                (location[0] - building.location[0]) ** 2 +
                (location[1] - building.location[1]) ** 2
            ) * 111000
            
            if dist < 500:
                if "商业" in building.type:
                    return "commercial"
                elif "住宅" in building.type:
                    return "residential"
                elif "工业" in building.type:
                    return "industrial"
        
        return "residential"
    
    def _create_drones(self):
        from simulation import DroneFactory
        
        num_fixed = self.num_drones // 3
        num_periodic = self.num_drones // 3
        num_emergency = self.num_drones - num_fixed - num_periodic
        
        center_lat = settings.city.center_lat
        center_lon = settings.city.center_lon
        
        if self.nests:
            center_lat = np.mean([n.position.lat for n in self.nests])
            center_lon = np.mean([n.position.lon for n in self.nests])
        
        self.drones, self.behaviors = DroneFactory.create_fleet(
            num_fixed_route=num_fixed,
            num_periodic=num_periodic,
            num_emergency=num_emergency,
            center_lat=center_lat,
            center_lon=center_lon,
        )
    
    def reset(self) -> State:
        self.current_step = 0
        self.matchings = {}
        
        for drone in self.drones:
            drone.energy = random.uniform(0.15, 0.5) * drone.max_energy
            drone.status = DroneStatus.IDLE
            drone.assigned_nest_id = None
        
        for nest in self.nests:
            for slot in nest.slots:
                slot.is_occupied = False
                slot.drone_id = None
        
        return self._get_state()
    
    def _get_state(self) -> State:
        graph_data = self._build_enhanced_graph()
        features = self._extract_enhanced_features()
        
        return State(
            drones=list(self.drones),
            nests=list(self.nests),
            graph_data=graph_data,
            features=features,
        )
    
    def _build_enhanced_graph(self) -> Data:
        base_graph = self.graph_builder.build_graph(self.drones, self.nests)
        
        if self.use_real_data and self.urban_environment:
            enhanced_features = self._add_real_world_features(base_graph.x)
            base_graph.x = enhanced_features
        
        return base_graph
    
    def _add_real_world_features(self, base_features: torch.Tensor) -> torch.Tensor:
        if base_features.size(0) == 0:
            return base_features
        
        num_nodes = base_features.size(0)
        additional_features = torch.zeros(num_nodes, 16)
        
        if self.urban_environment:
            weather = self.urban_environment.weather
            if weather:
                weather_features = torch.tensor([
                    weather.temperature / 40,
                    weather.humidity / 100,
                    weather.wind_speed / 10,
                    1.0 if "雨" in weather.weather else 0.0,
                ])
                additional_features[:, :4] = weather_features
            
            num_buildings = len(self.urban_environment.buildings)
            avg_height = np.mean([b.height for b in self.urban_environment.buildings]) if self.urban_environment.buildings else 0
            additional_features[:, 4] = num_buildings / 100
            additional_features[:, 5] = avg_height / 200
            
            num_restricted = len(self.urban_environment.restricted_zones)
            additional_features[:, 6] = num_restricted / 10
        
        return torch.cat([base_features, additional_features], dim=1)
    
    def _extract_enhanced_features(self) -> np.ndarray:
        features = []
        
        for drone in self.drones:
            drone_features = [
                drone.position.lat,
                drone.position.lon,
                drone.position.altitude / 500,
                drone.energy / drone.max_energy,
                drone.speed / 30.0,
                drone.task_priority / 2.0,
                1.0 if drone.status == DroneStatus.IDLE else 0.0,
                1.0 if drone.assigned_nest_id else 0.0,
            ]
            
            if self.training_adapter:
                real_features = self.training_adapter.get_state_features(
                    (drone.position.lat, drone.position.lon, drone.position.altitude)
                )
                drone_features.extend(real_features[:8].tolist())
            else:
                drone_features.extend([0.0] * 8)
            
            features.extend(drone_features)
        
        for nest in self.nests:
            nest_features = [
                nest.position.lat,
                nest.position.lon,
                nest.position.altitude / 500,
                nest.available_slots() / nest.capacity,
                nest.demand_density,
                nest.historical_usage_rate,
            ]
            
            if self.training_adapter:
                real_features = self.training_adapter.get_state_features(
                    (nest.position.lat, nest.position.lon, nest.position.altitude)
                )
                nest_features.extend(real_features[:6].tolist())
            else:
                nest_features.extend([0.0] * 6)
            
            features.extend(nest_features)
        
        return np.array(features, dtype=np.float32)
    
    def step(self, action: Action) -> Tuple[State, float, bool, Dict]:
        self.current_step += 1
        
        reward = self._execute_action(action)
        
        self._update_simulation()
        
        next_state = self._get_state()
        
        done = self.current_step >= self.max_steps
        
        info = {
            "step": self.current_step,
            "matchings": len(self.matchings),
            "avg_energy": np.mean([d.energy / d.max_energy for d in self.drones]),
        }
        
        return next_state, reward, done, info
    
    def _execute_action(self, action: Action) -> float:
        drone = next((d for d in self.drones if d.id == action.drone_id), None)
        nest = next((n for n in self.nests if n.id == action.nest_id), None)
        
        if not drone or not nest:
            return self.reward_weights["timeout_penalty"]
        
        if not nest.is_available():
            return self.reward_weights["timeout_penalty"]
        
        if drone.assigned_nest_id:
            return self.reward_weights["timeout_penalty"]
        
        distance = drone.position.distance_to(nest.position)
        energy_cost = distance * drone.energy_consumption_rate
        
        if self.use_real_data and self.training_adapter:
            weather_penalty = self._calculate_weather_penalty()
            energy_cost *= (1.0 + weather_penalty)
        
        if drone.energy < energy_cost:
            return self.reward_weights["timeout_penalty"]
        
        slot_idx = nest.occupy_slot(drone.id)
        if slot_idx is None:
            return self.reward_weights["timeout_penalty"]
        
        drone.assigned_nest_id = nest.id
        drone.energy -= energy_cost
        self.matchings[drone.id] = nest.id
        
        reward = self._calculate_reward(drone, nest, distance, energy_cost)
        
        return reward
    
    def _calculate_weather_penalty(self) -> float:
        if not self.urban_environment or not self.urban_environment.weather:
            return 0.0
        
        weather = self.urban_environment.weather
        penalty = 0.0
        
        if "雨" in weather.weather:
            penalty += 0.2
        if "雪" in weather.weather:
            penalty += 0.3
        if weather.wind_speed > 5:
            penalty += 0.1 * (weather.wind_speed - 5)
        
        return penalty
    
    def _calculate_reward(
        self,
        drone: Drone,
        nest: Nest,
        distance: float,
        energy_cost: float,
    ) -> float:
        reward = 0.0
        
        energy_efficiency = 1.0 - (energy_cost / drone.max_energy)
        reward += self.reward_weights["energy_efficiency"] * energy_efficiency
        
        matching_quality = nest.demand_density * (1.0 + nest.available_slots() / nest.capacity)
        reward += self.reward_weights["matching_quality"] * matching_quality
        
        if drone.task_priority >= 1.5:
            reward += self.reward_weights["emergency_priority"]
        
        load_balance = 1.0 - abs(nest.available_slots() / nest.capacity - 0.5)
        reward += self.reward_weights["load_balance"] * load_balance
        
        if self.use_real_data and self.training_adapter:
            real_reward = self.training_adapter.calculate_reward(
                (drone.position.lat, drone.position.lon, drone.position.altitude),
                (nest.position.lat, nest.position.lon, nest.position.altitude),
                energy_cost,
            )
            reward += 0.3 * real_reward
        
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
                            slot_id = next((s.slot_id for s in nest.slots if s.drone_id == drone.id), None)
                            if slot_id is not None:
                                nest.release_slot(slot_id)
                            drone.assigned_nest_id = None
            
            if not drone.assigned_nest_id:
                energy_drain = random.uniform(0.1, 0.5)
                
                if self.use_real_data and self.urban_environment and self.urban_environment.weather:
                    if "雨" in self.urban_environment.weather.weather:
                        energy_drain *= 1.2
                
                drone.energy = max(0, drone.energy - energy_drain)
        
        for nest in self.nests:
            usage_rate = (nest.capacity - nest.available_slots()) / nest.capacity
            nest.historical_usage_rate = 0.9 * nest.historical_usage_rate + 0.1 * usage_rate
    
    def get_valid_actions(self) -> List[Action]:
        valid_actions = []
        
        for drone in self.drones:
            if drone.assigned_nest_id:
                continue
            
            if drone.remaining_energy_ratio() < 0.6:
                for nest in self.nests:
                    if nest.is_available():
                        distance = drone.position.distance_to(nest.position)
                        energy_needed = distance * drone.energy_consumption_rate
                        
                        if self.use_real_data:
                            weather_penalty = self._calculate_weather_penalty()
                            energy_needed *= (1.0 + weather_penalty)
                        
                        if drone.energy >= energy_needed:
                            valid_actions.append(Action(drone.id, nest.id))
        
        return valid_actions
    
    def render(self):
        print(f"\n=== Step {self.current_step} ===")
        print(f"Active matchings: {len(self.matchings)}")
        
        avg_energy = np.mean([d.energy / d.max_energy for d in self.drones])
        print(f"Average drone energy: {avg_energy:.2%}")
        
        available_slots = sum(n.available_slots() for n in self.nests)
        total_slots = sum(n.capacity for n in self.nests)
        print(f"Nest availability: {available_slots}/{total_slots}")
        
        if self.use_real_data and self.urban_environment and self.urban_environment.weather:
            weather = self.urban_environment.weather
            print(f"Weather: {weather.weather}, Temp: {weather.temperature}°C, Wind: {weather.wind_speed}m/s")


def create_real_world_env(
    city: str = "合肥",
    num_drones: int = 30,
    num_nests: int = 15,
    use_real_data: bool = True,
) -> RealWorldSchedulingEnv:
    return RealWorldSchedulingEnv(
        city=city,
        num_drones=num_drones,
        num_nests=num_nests,
        use_real_data=use_real_data,
    )
