from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class DroneStatusEnum(str, Enum):
    IDLE = "idle"
    FLYING = "flying"
    CHARGING = "charging"
    ON_MISSION = "on_mission"
    RETURNING = "returning"
    EMERGENCY = "emergency"


class NestStatusEnum(str, Enum):
    AVAILABLE = "available"
    FULL = "full"
    MAINTENANCE = "maintenance"
    OFFLINE = "offline"


class TaskTypeEnum(str, Enum):
    FIXED_ROUTE = "fixed_route"
    PERIODIC_PATROL = "periodic_patrol"
    EMERGENCY_RESCUE = "emergency_rescue"


class PositionSchema(BaseModel):
    lat: float
    lon: float
    altitude: float = 100.0


class DroneCreate(BaseModel):
    drone_type: str
    lat: float
    lon: float
    altitude: float = 100.0
    energy: Optional[float] = None
    max_energy: Optional[float] = None


class DroneUpdate(BaseModel):
    lat: Optional[float] = None
    lon: Optional[float] = None
    altitude: Optional[float] = None
    energy: Optional[float] = None
    status: Optional[DroneStatusEnum] = None


class DroneResponse(BaseModel):
    id: str
    drone_type: str
    position: PositionSchema
    energy: float
    max_energy: float
    energy_consumption_rate: float
    speed: float
    status: str
    current_task_id: Optional[str]
    assigned_nest_id: Optional[str]
    task_priority: float
    remaining_energy_ratio: float
    created_at: datetime
    updated_at: datetime


class NestCreate(BaseModel):
    name: str
    lat: float
    lon: float
    capacity: int = 4
    region_type: str = "residential"
    demand_density: float = 0.5


class NestUpdate(BaseModel):
    name: Optional[str] = None
    capacity: Optional[int] = None
    status: Optional[NestStatusEnum] = None
    demand_density: Optional[float] = None


class NestSlotSchema(BaseModel):
    slot_id: int
    is_occupied: bool
    drone_id: Optional[str]
    charging_power: float
    current_charge: float


class NestResponse(BaseModel):
    id: str
    name: str
    position: PositionSchema
    capacity: int
    slots: List[NestSlotSchema]
    status: str
    region_type: str
    demand_density: float
    historical_usage_rate: float
    available_slots: int
    created_at: datetime
    updated_at: datetime


class MatchingResultSchema(BaseModel):
    drone_id: str
    nest_id: str
    advantage_value: float
    travel_time: float
    energy_cost: float
    timestamp: datetime


class SchedulingRequest(BaseModel):
    drone_ids: Optional[List[str]] = None
    nest_ids: Optional[List[str]] = None
    algorithm: str = "km"


class SchedulingResponse(BaseModel):
    success: bool
    matched_pairs: List[MatchingResultSchema]
    total_advantage: float
    computation_time: float
    drones_matched: int
    nests_used: int
    energy_saved: float


class SimulationConfig(BaseModel):
    duration_hours: float = 10.0
    num_nests: int = 150
    num_drones_fixed: int = 30
    num_drones_periodic: int = 40
    num_drones_emergency: int = 30
    output_dir: str = "data/simulation"


class SimulationStatus(BaseModel):
    is_running: bool
    progress: float
    elapsed_time: float
    eta: float
    total_steps: int
    current_step: int


class SchedulerStatus(BaseModel):
    state: str
    dispatch_interval: float
    algorithm: str
    pending_requests: int
    metrics: Dict[str, Any]


class EnvironmentStats(BaseModel):
    total_nests: int
    total_capacity: int
    total_available: int
    region_statistics: Dict[str, Dict]


class ApiResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Any] = None


class WebSocketMessage(BaseModel):
    type: str
    data: Dict[str, Any]
    timestamp: datetime = Field(default_factory=datetime.now)


class DroneListResponse(BaseModel):
    drones: List[DroneResponse]
    total: int


class NestListResponse(BaseModel):
    nests: List[NestResponse]
    total: int


class MetricsResponse(BaseModel):
    total_schedules: int
    total_matchings: int
    avg_computation_time: float
    avg_advantage: float
    total_energy_saved: float
    emergency_responses: int


class GATTrainRequest(BaseModel):
    epochs: int = 100
    batch_size: int = 64
    learning_rate: float = 0.001
    save_path: str = "models/gat_model.pt"


class GATTrainStatus(BaseModel):
    is_training: bool
    current_epoch: int
    total_epochs: int
    train_loss: float
    val_loss: float
    best_val_loss: float
