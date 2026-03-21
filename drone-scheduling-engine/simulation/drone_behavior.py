import random
import math
from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime
from dataclasses import dataclass, field

from config import settings, DroneType, TaskPriority
from models import Drone, Position, Task, TaskType, TaskStatus, DroneStatus


@dataclass
class FlightPath:
    waypoints: List[Position]
    current_waypoint_index: int = 0
    is_cyclic: bool = True
    
    def get_current_target(self) -> Optional[Position]:
        if self.current_waypoint_index < len(self.waypoints):
            return self.waypoints[self.current_waypoint_index]
        return None
    
    def advance(self) -> Optional[Position]:
        self.current_waypoint_index += 1
        if self.current_waypoint_index >= len(self.waypoints):
            if self.is_cyclic:
                self.current_waypoint_index = 0
            else:
                return None
        return self.get_current_target()


class DroneBehavior(ABC):
    
    @abstractmethod
    def update(self, drone: Drone, dt: float, environment: Any) -> Tuple[Position, float, Optional[Task]]:
        pass
    
    @abstractmethod
    def should_request_charging(self, drone: Drone) -> bool:
        pass
    
    @abstractmethod
    def generate_initial_position(self, center_lat: float, center_lon: float) -> Position:
        pass


class FixedRouteBehavior(DroneBehavior):
    
    def __init__(self, route_waypoints: List[Position] = None):
        self.route_waypoints = route_waypoints or []
        self.current_waypoint_idx = 0
        self.patrol_interval = settings.drone.FIXED_ROUTE["patrol_interval"]
        self.last_patrol_time = datetime.now()
        
    def update(self, drone: Drone, dt: float, environment: Any) -> Tuple[Position, float, Optional[Task]]:
        if not self.route_waypoints:
            return drone.position, 0.0, None
        
        target = self.route_waypoints[self.current_waypoint_idx]
        
        new_pos, distance, arrived = self._move_towards(drone, target, dt)
        energy_consumed = distance * drone.energy_consumption_rate
        
        if arrived:
            self.current_waypoint_idx = (self.current_waypoint_idx + 1) % len(self.route_waypoints)
        
        task = None
        if drone.status != DroneStatus.ON_MISSION:
            drone.status = DroneStatus.FLYING
        
        return new_pos, energy_consumed, task
    
    def _move_towards(self, drone: Drone, target: Position, dt: float) -> Tuple[Position, float, bool]:
        distance = drone.position.distance_to(target)
        
        if distance < 10:
            return target, distance, True
        
        max_distance = drone.speed * dt
        ratio = min(max_distance / distance, 1.0)
        
        new_lat = drone.position.lat + (target.lat - drone.position.lat) * ratio
        new_lon = drone.position.lon + (target.lon - drone.position.lon) * ratio
        
        new_pos = Position(lat=new_lat, lon=new_lon, altitude=drone.position.altitude)
        traveled = distance * ratio
        
        return new_pos, traveled, ratio >= 1.0
    
    def should_request_charging(self, drone: Drone) -> bool:
        return drone.remaining_energy_ratio() < 0.3
    
    def generate_initial_position(self, center_lat: float, center_lon: float) -> Position:
        lat = center_lat + random.uniform(-0.05, 0.05)
        lon = center_lon + random.uniform(-0.05, 0.05)
        return Position(lat=lat, lon=lon)
    
    def generate_route(self, center_lat: float, center_lon: float, num_waypoints: int = 5) -> List[Position]:
        waypoints = []
        for i in range(num_waypoints):
            angle = 2 * math.pi * i / num_waypoints
            radius = random.uniform(0.02, 0.05)
            lat = center_lat + radius * math.cos(angle)
            lon = center_lon + radius * math.sin(angle)
            waypoints.append(Position(lat=lat, lon=lon))
        return waypoints


class PeriodicPatrolBehavior(DroneBehavior):
    
    def __init__(self, patrol_area: Tuple[Position, Position] = None):
        self.patrol_area = patrol_area
        self.patrol_interval = settings.drone.PERIODIC_PATROL["patrol_interval"]
        self.last_patrol_time = datetime.now()
        self.current_patrol_target: Optional[Position] = None
        self.is_patrolling = False
        self.home_position: Optional[Position] = None
        
    def update(self, drone: Drone, dt: float, environment: Any) -> Tuple[Position, float, Optional[Task]]:
        now = datetime.now()
        time_since_patrol = (now - self.last_patrol_time).total_seconds()
        
        if not self.is_patrolling and time_since_patrol >= self.patrol_interval:
            self.is_patrolling = True
            self.current_patrol_target = self._generate_patrol_target(drone.position)
            self.last_patrol_time = now
        
        if self.is_patrolling and self.current_patrol_target:
            new_pos, distance, arrived = self._move_towards(drone, self.current_patrol_target, dt)
            energy_consumed = distance * drone.energy_consumption_rate
            
            if arrived:
                self.is_patrolling = False
                self.current_patrol_target = None
                drone.status = DroneStatus.IDLE
            
            task = Task(
                task_type=TaskType.PERIODIC_PATROL,
                drone_id=drone.id,
                start_position=drone.position,
                end_position=self.current_patrol_target,
                priority=TaskPriority.PERIODIC.value,
                status=TaskStatus.IN_PROGRESS,
            ) if self.is_patrolling else None
            
            return new_pos, energy_consumed, task
        
        return drone.position, 0.0, None
    
    def _generate_patrol_target(self, current_pos: Position) -> Position:
        angle = random.uniform(0, 2 * math.pi)
        distance = random.uniform(0.01, 0.03)
        
        lat = current_pos.lat + distance * math.cos(angle)
        lon = current_pos.lon + distance * math.sin(angle)
        
        return Position(lat=lat, lon=lon)
    
    def _move_towards(self, drone: Drone, target: Position, dt: float) -> Tuple[Position, float, bool]:
        distance = drone.position.distance_to(target)
        
        if distance < 10:
            return target, distance, True
        
        max_distance = drone.speed * dt
        ratio = min(max_distance / distance, 1.0)
        
        new_lat = drone.position.lat + (target.lat - drone.position.lat) * ratio
        new_lon = drone.position.lon + (target.lon - drone.position.lon) * ratio
        
        new_pos = Position(lat=new_lat, lon=new_lon, altitude=drone.position.altitude)
        traveled = distance * ratio
        
        return new_pos, traveled, ratio >= 1.0
    
    def should_request_charging(self, drone: Drone) -> bool:
        return drone.remaining_energy_ratio() < 0.25
    
    def generate_initial_position(self, center_lat: float, center_lon: float) -> Position:
        lat = center_lat + random.uniform(-0.03, 0.03)
        lon = center_lon + random.uniform(-0.03, 0.03)
        self.home_position = Position(lat=lat, lon=lon)
        return self.home_position


class EmergencyRescueBehavior(DroneBehavior):
    
    def __init__(self):
        self.emergency_target: Optional[Position] = None
        self.is_on_emergency = False
        self.emergency_probability = 0.001
        self.returning_home = False
        self.home_position: Optional[Position] = None
        
    def update(self, drone: Drone, dt: float, environment: Any) -> Tuple[Position, float, Optional[Task]]:
        if not self.is_on_emergency and not self.returning_home:
            if random.random() < self.emergency_probability:
                self._trigger_emergency(drone, environment)
        
        if self.is_on_emergency and self.emergency_target:
            new_pos, distance, arrived = self._move_towards(drone, self.emergency_target, dt)
            energy_consumed = distance * drone.energy_consumption_rate
            
            if arrived:
                self.is_on_emergency = False
                self.returning_home = True
                drone.status = DroneStatus.RETURNING
            
            task = Task(
                task_type=TaskType.EMERGENCY_RESCUE,
                drone_id=drone.id,
                start_position=drone.position,
                end_position=self.emergency_target,
                priority=TaskPriority.EMERGENCY.value,
                status=TaskStatus.IN_PROGRESS,
            )
            
            return new_pos, energy_consumed, task
        
        if self.returning_home and self.home_position:
            new_pos, distance, arrived = self._move_towards(drone, self.home_position, dt)
            energy_consumed = distance * drone.energy_consumption_rate
            
            if arrived:
                self.returning_home = False
                drone.status = DroneStatus.IDLE
            
            return new_pos, energy_consumed, None
        
        return drone.position, 0.0, None
    
    def _trigger_emergency(self, drone: Drone, environment: Any):
        self.is_on_emergency = True
        drone.status = DroneStatus.ON_MISSION
        
        emergency_nests = environment.get_nests_by_region("emergency") if environment else []
        
        if emergency_nests:
            target_nest = random.choice(emergency_nests)
            self.emergency_target = target_nest.position
        else:
            angle = random.uniform(0, 2 * math.pi)
            distance = random.uniform(0.02, 0.05)
            lat = drone.position.lat + distance * math.cos(angle)
            lon = drone.position.lon + distance * math.sin(angle)
            self.emergency_target = Position(lat=lat, lon=lon)
    
    def _move_towards(self, drone: Drone, target: Position, dt: float) -> Tuple[Position, float, bool]:
        distance = drone.position.distance_to(target)
        
        if distance < 10:
            return target, distance, True
        
        max_distance = drone.speed * dt
        ratio = min(max_distance / distance, 1.0)
        
        new_lat = drone.position.lat + (target.lat - drone.position.lat) * ratio
        new_lon = drone.position.lon + (target.lon - drone.position.lon) * ratio
        
        new_pos = Position(lat=new_lat, lon=new_lon, altitude=drone.position.altitude)
        traveled = distance * ratio
        
        return new_pos, traveled, ratio >= 1.0
    
    def should_request_charging(self, drone: Drone) -> bool:
        return drone.remaining_energy_ratio() < 0.2
    
    def generate_initial_position(self, center_lat: float, center_lon: float) -> Position:
        lat = center_lat + random.uniform(-0.02, 0.02)
        lon = center_lon + random.uniform(-0.02, 0.02)
        self.home_position = Position(lat=lat, lon=lon)
        return self.home_position


class DroneFactory:
    
    @staticmethod
    def create_drone(
        drone_type: str,
        drone_id: str = None,
        position: Position = None,
        center_lat: float = None,
        center_lon: float = None,
    ) -> Tuple[Drone, DroneBehavior]:
        
        center_lat = center_lat or settings.city.center_lat
        center_lon = center_lon or settings.city.center_lon
        
        config_map = {
            DroneType.FIXED_ROUTE.value: settings.drone.FIXED_ROUTE,
            DroneType.PERIODIC_PATROL.value: settings.drone.PERIODIC_PATROL,
            DroneType.EMERGENCY_RESCUE.value: settings.drone.EMERGENCY_RESCUE,
        }
        
        config = config_map.get(drone_type, settings.drone.FIXED_ROUTE)
        
        if position is None:
            behavior_classes = {
                DroneType.FIXED_ROUTE.value: FixedRouteBehavior,
                DroneType.PERIODIC_PATROL.value: PeriodicPatrolBehavior,
                DroneType.EMERGENCY_RESCUE.value: EmergencyRescueBehavior,
            }
            behavior = behavior_classes[drone_type]()
            position = behavior.generate_initial_position(center_lat, center_lon)
        else:
            behavior_classes = {
                DroneType.FIXED_ROUTE.value: FixedRouteBehavior,
                DroneType.PERIODIC_PATROL.value: PeriodicPatrolBehavior,
                DroneType.EMERGENCY_RESCUE.value: EmergencyRescueBehavior,
            }
            behavior = behavior_classes[drone_type]()
        
        if drone_type == DroneType.FIXED_ROUTE.value:
            behavior.route_waypoints = behavior.generate_route(center_lat, center_lon)
        
        drone = Drone(
            id=drone_id or f"DRONE-{random.randint(1, 9999):04d}",
            drone_type=drone_type,
            position=position,
            energy=config["max_energy"],
            max_energy=config["max_energy"],
            energy_consumption_rate=config["energy_consumption_rate"],
            speed=config["speed"],
            task_priority=config["task_priority"],
            status=DroneStatus.IDLE,
        )
        
        return drone, behavior
    
    @staticmethod
    def create_fleet(
        num_fixed_route: int = 30,
        num_periodic: int = 40,
        num_emergency: int = 30,
        center_lat: float = None,
        center_lon: float = None,
    ) -> Tuple[List[Drone], Dict[str, DroneBehavior]]:
        
        drones = []
        behaviors = {}
        
        for i in range(num_fixed_route):
            drone, behavior = DroneFactory.create_drone(
                drone_type=DroneType.FIXED_ROUTE.value,
                center_lat=center_lat,
                center_lon=center_lon,
            )
            drones.append(drone)
            behaviors[drone.id] = behavior
        
        for i in range(num_periodic):
            drone, behavior = DroneFactory.create_drone(
                drone_type=DroneType.PERIODIC_PATROL.value,
                center_lat=center_lat,
                center_lon=center_lon,
            )
            drones.append(drone)
            behaviors[drone.id] = behavior
        
        for i in range(num_emergency):
            drone, behavior = DroneFactory.create_drone(
                drone_type=DroneType.EMERGENCY_RESCUE.value,
                center_lat=center_lat,
                center_lon=center_lon,
            )
            drones.append(drone)
            behaviors[drone.id] = behavior
        
        return drones, behaviors
