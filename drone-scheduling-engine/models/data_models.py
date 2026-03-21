from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum
import uuid


class DroneStatus(Enum):
    IDLE = "idle"
    FLYING = "flying"
    CHARGING = "charging"
    ON_MISSION = "on_mission"
    RETURNING = "returning"
    EMERGENCY = "emergency"


class NestStatus(Enum):
    AVAILABLE = "available"
    FULL = "full"
    MAINTENANCE = "maintenance"
    OFFLINE = "offline"


class TaskStatus(Enum):
    PENDING = "pending"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class TaskType(Enum):
    FIXED_ROUTE = "fixed_route"
    PERIODIC_PATROL = "periodic_patrol"
    EMERGENCY_RESCUE = "emergency_rescue"


@dataclass
class Position:
    lat: float
    lon: float
    altitude: float = 100.0
    
    def to_dict(self) -> Dict[str, float]:
        return {"lat": self.lat, "lon": self.lon, "altitude": self.altitude}
    
    def distance_to(self, other: "Position") -> float:
        import math
        R = 6371000
        phi1 = math.radians(self.lat)
        phi2 = math.radians(other.lat)
        delta_phi = math.radians(other.lat - self.lat)
        delta_lambda = math.radians(other.lon - self.lon)
        
        a = math.sin(delta_phi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        
        return R * c


@dataclass
class Drone:
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    drone_type: str = "fixed_route"
    position: Position = field(default_factory=lambda: Position(0, 0))
    energy: float = 5000.0
    max_energy: float = 5000.0
    energy_consumption_rate: float = 0.5
    speed: float = 15.0
    status: DroneStatus = DroneStatus.IDLE
    current_task_id: Optional[str] = None
    assigned_nest_id: Optional[str] = None
    task_priority: float = 0.6
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    
    def remaining_energy_ratio(self) -> float:
        return self.energy / self.max_energy
    
    def can_reach(self, target: Position, energy_margin: float = 0.2) -> bool:
        distance = self.position.distance_to(target)
        required_energy = distance * self.energy_consumption_rate
        return self.energy >= required_energy * (1 + energy_margin)
    
    def estimated_travel_time(self, target: Position) -> float:
        distance = self.position.distance_to(target)
        return distance / self.speed
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "drone_type": self.drone_type,
            "position": self.position.to_dict(),
            "energy": self.energy,
            "max_energy": self.max_energy,
            "energy_consumption_rate": self.energy_consumption_rate,
            "speed": self.speed,
            "status": self.status.value,
            "current_task_id": self.current_task_id,
            "assigned_nest_id": self.assigned_nest_id,
            "task_priority": self.task_priority,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


@dataclass
class NestSlot:
    slot_id: int
    is_occupied: bool = False
    drone_id: Optional[str] = None
    charging_power: float = 1500.0
    current_charge: float = 0.0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "slot_id": self.slot_id,
            "is_occupied": self.is_occupied,
            "drone_id": self.drone_id,
            "charging_power": self.charging_power,
            "current_charge": self.current_charge,
        }


@dataclass
class Nest:
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    name: str = ""
    position: Position = field(default_factory=lambda: Position(0, 0))
    capacity: int = 4
    slots: List[NestSlot] = field(default_factory=list)
    status: NestStatus = NestStatus.AVAILABLE
    region_type: str = "residential"
    demand_density: float = 0.5
    historical_usage_rate: float = 0.0
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    
    def __post_init__(self):
        if not self.slots:
            self.slots = [NestSlot(slot_id=i) for i in range(self.capacity)]
    
    def available_slots(self) -> int:
        return sum(1 for slot in self.slots if not slot.is_occupied)
    
    def is_available(self) -> bool:
        return self.status == NestStatus.AVAILABLE and self.available_slots() > 0
    
    def occupy_slot(self, drone_id: str) -> Optional[int]:
        for slot in self.slots:
            if not slot.is_occupied:
                slot.is_occupied = True
                slot.drone_id = drone_id
                return slot.slot_id
        return None
    
    def release_slot(self, slot_id: int) -> bool:
        for slot in self.slots:
            if slot.slot_id == slot_id:
                slot.is_occupied = False
                slot.drone_id = None
                slot.current_charge = 0.0
                return True
        return False
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "position": self.position.to_dict(),
            "capacity": self.capacity,
            "slots": [slot.to_dict() for slot in self.slots],
            "status": self.status.value,
            "region_type": self.region_type,
            "demand_density": self.demand_density,
            "historical_usage_rate": self.historical_usage_rate,
            "available_slots": self.available_slots(),
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


@dataclass
class Task:
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    task_type: TaskType = TaskType.FIXED_ROUTE
    drone_id: Optional[str] = None
    start_position: Position = field(default_factory=lambda: Position(0, 0))
    end_position: Position = field(default_factory=lambda: Position(0, 0))
    waypoints: List[Position] = field(default_factory=list)
    priority: float = 1.0
    status: TaskStatus = TaskStatus.PENDING
    created_at: datetime = field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    estimated_duration: float = 0.0
    actual_duration: float = 0.0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "task_type": self.task_type.value,
            "drone_id": self.drone_id,
            "start_position": self.start_position.to_dict(),
            "end_position": self.end_position.to_dict(),
            "waypoints": [wp.to_dict() for wp in self.waypoints],
            "priority": self.priority,
            "status": self.status.value,
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "estimated_duration": self.estimated_duration,
            "actual_duration": self.actual_duration,
        }


@dataclass
class MatchingResult:
    drone_id: str
    nest_id: str
    advantage_value: float
    travel_time: float
    energy_cost: float
    timestamp: datetime = field(default_factory=datetime.now)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "drone_id": self.drone_id,
            "nest_id": self.nest_id,
            "advantage_value": self.advantage_value,
            "travel_time": self.travel_time,
            "energy_cost": self.energy_cost,
            "timestamp": self.timestamp.isoformat(),
        }


@dataclass
class SimulationState:
    timestamp: datetime
    drones: List[Drone]
    nests: List[Nest]
    tasks: List[Task]
    matchings: List[MatchingResult]
    total_energy_consumed: float = 0.0
    total_distance_traveled: float = 0.0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp.isoformat(),
            "drones": [d.to_dict() for d in self.drones],
            "nests": [n.to_dict() for n in self.nests],
            "tasks": [t.to_dict() for t in self.tasks],
            "matchings": [m.to_dict() for m in self.matchings],
            "total_energy_consumed": self.total_energy_consumed,
            "total_distance_traveled": self.total_distance_traveled,
        }
