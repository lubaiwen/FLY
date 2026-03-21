from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from typing import List, Optional, Dict, Any
from datetime import datetime
import asyncio
import json
import os

from models import Drone, Nest, Position, DroneStatus, NestStatus
from core import SchedulingEngine, RealTimeScheduler, SchedulingResult
from simulation import CityEnvironment, DroneFactory
from algorithms import AdvantageFunction
from api.schemas import (
    DroneCreate, DroneUpdate, DroneResponse,
    NestCreate, NestUpdate, NestResponse,
    SchedulingRequest, SchedulingResponse, MatchingResultSchema,
    SimulationConfig, SimulationStatus,
    SchedulerStatus, ApiResponse, DroneListResponse, NestListResponse,
    MetricsResponse, WebSocketMessage, GATTrainRequest, GATTrainStatus,
)

router = APIRouter()

scheduler = RealTimeScheduler()
simulation_task: Optional[asyncio.Task] = None
simulation_status: Dict[str, Any] = {
    "is_running": False,
    "progress": 0.0,
    "elapsed_time": 0.0,
    "eta": 0.0,
    "total_steps": 0,
    "current_step": 0,
}

websocket_connections: List[WebSocket] = []


async def broadcast_to_websockets(message: Dict):
    for connection in websocket_connections:
        try:
            await connection.send_json(message)
        except Exception:
            websocket_connections.remove(connection)


def drone_to_response(drone: Drone) -> DroneResponse:
    return DroneResponse(
        id=drone.id,
        drone_type=drone.drone_type,
        position=PositionSchema(
            lat=drone.position.lat,
            lon=drone.position.lon,
            altitude=drone.position.altitude,
        ),
        energy=drone.energy,
        max_energy=drone.max_energy,
        energy_consumption_rate=drone.energy_consumption_rate,
        speed=drone.speed,
        status=drone.status.value,
        current_task_id=drone.current_task_id,
        assigned_nest_id=drone.assigned_nest_id,
        task_priority=drone.task_priority,
        remaining_energy_ratio=drone.remaining_energy_ratio(),
        created_at=drone.created_at,
        updated_at=drone.updated_at,
    )


def nest_to_response(nest: Nest) -> NestResponse:
    from api.schemas import NestSlotSchema, PositionSchema
    return NestResponse(
        id=nest.id,
        name=nest.name,
        position=PositionSchema(
            lat=nest.position.lat,
            lon=nest.position.lon,
            altitude=nest.position.altitude,
        ),
        capacity=nest.capacity,
        slots=[
            NestSlotSchema(
                slot_id=slot.slot_id,
                is_occupied=slot.is_occupied,
                drone_id=slot.drone_id,
                charging_power=slot.charging_power,
                current_charge=slot.current_charge,
            )
            for slot in nest.slots
        ],
        status=nest.status.value,
        region_type=nest.region_type,
        demand_density=nest.demand_density,
        historical_usage_rate=nest.historical_usage_rate,
        available_slots=nest.available_slots(),
        created_at=nest.created_at,
        updated_at=nest.updated_at,
    )


@router.get("/drones", response_model=DroneListResponse)
async def get_drones(
    status: Optional[str] = None,
    drone_type: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
):
    drones = scheduler.get_all_drones()
    
    if status:
        drones = [d for d in drones if d.status.value == status]
    if drone_type:
        drones = [d for d in drones if d.drone_type == drone_type]
    
    total = len(drones)
    drones = drones[offset:offset + limit]
    
    return DroneListResponse(
        drones=[drone_to_response(d) for d in drones],
        total=total,
    )


@router.get("/drones/{drone_id}", response_model=DroneResponse)
async def get_drone(drone_id: str):
    drones = scheduler.get_all_drones()
    drone = next((d for d in drones if d.id == drone_id), None)
    
    if not drone:
        raise HTTPException(status_code=404, detail="Drone not found")
    
    return drone_to_response(drone)


@router.post("/drones", response_model=DroneResponse)
async def create_drone(drone_data: DroneCreate):
    drone, behavior = DroneFactory.create_drone(
        drone_type=drone_data.drone_type,
        position=Position(lat=drone_data.lat, lon=drone_data.lon, altitude=drone_data.altitude),
    )
    
    if drone_data.energy:
        drone.energy = drone_data.energy
    if drone_data.max_energy:
        drone.max_energy = drone_data.max_energy
    
    scheduler.update_drone(drone)
    
    await broadcast_to_websockets({
        "type": "drone_created",
        "data": drone.to_dict(),
    })
    
    return drone_to_response(drone)


@router.put("/drones/{drone_id}", response_model=DroneResponse)
async def update_drone(drone_id: str, drone_data: DroneUpdate):
    drones = scheduler.get_all_drones()
    drone = next((d for d in drones if d.id == drone_id), None)
    
    if not drone:
        raise HTTPException(status_code=404, detail="Drone not found")
    
    if drone_data.lat is not None:
        drone.position.lat = drone_data.lat
    if drone_data.lon is not None:
        drone.position.lon = drone_data.lon
    if drone_data.altitude is not None:
        drone.position.altitude = drone_data.altitude
    if drone_data.energy is not None:
        drone.energy = drone_data.energy
    if drone_data.status is not None:
        drone.status = DroneStatus(drone_data.status.value)
    
    drone.updated_at = datetime.now()
    scheduler.update_drone(drone)
    
    await broadcast_to_websockets({
        "type": "drone_updated",
        "data": drone.to_dict(),
    })
    
    return drone_to_response(drone)


@router.delete("/drones/{drone_id}", response_model=ApiResponse)
async def delete_drone(drone_id: str):
    scheduler.remove_drone(drone_id)
    
    await broadcast_to_websockets({
        "type": "drone_deleted",
        "data": {"id": drone_id},
    })
    
    return ApiResponse(success=True, message="Drone deleted successfully")


@router.get("/nests", response_model=NestListResponse)
async def get_nests(
    status: Optional[str] = None,
    region_type: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
):
    nests = scheduler.get_all_nests()
    
    if status:
        nests = [n for n in nests if n.status.value == status]
    if region_type:
        nests = [n for n in nests if n.region_type == region_type]
    
    total = len(nests)
    nests = nests[offset:offset + limit]
    
    return NestListResponse(
        nests=[nest_to_response(n) for n in nests],
        total=total,
    )


@router.get("/nests/{nest_id}", response_model=NestResponse)
async def get_nest(nest_id: str):
    nests = scheduler.get_all_nests()
    nest = next((n for n in nests if n.id == nest_id), None)
    
    if not nest:
        raise HTTPException(status_code=404, detail="Nest not found")
    
    return nest_to_response(nest)


@router.post("/nests", response_model=NestResponse)
async def create_nest(nest_data: NestCreate):
    from models import Nest, NestSlot
    
    nest = Nest(
        name=nest_data.name,
        position=Position(lat=nest_data.lat, lon=nest_data.lon),
        capacity=nest_data.capacity,
        region_type=nest_data.region_type,
        demand_density=nest_data.demand_density,
    )
    
    scheduler.update_nest(nest)
    
    await broadcast_to_websockets({
        "type": "nest_created",
        "data": nest.to_dict(),
    })
    
    return nest_to_response(nest)


@router.put("/nests/{nest_id}", response_model=NestResponse)
async def update_nest(nest_id: str, nest_data: NestUpdate):
    nests = scheduler.get_all_nests()
    nest = next((n for n in nests if n.id == nest_id), None)
    
    if not nest:
        raise HTTPException(status_code=404, detail="Nest not found")
    
    if nest_data.name is not None:
        nest.name = nest_data.name
    if nest_data.capacity is not None:
        nest.capacity = nest_data.capacity
    if nest_data.status is not None:
        nest.status = NestStatus(nest_data.status.value)
    if nest_data.demand_density is not None:
        nest.demand_density = nest_data.demand_density
    
    nest.updated_at = datetime.now()
    scheduler.update_nest(nest)
    
    await broadcast_to_websockets({
        "type": "nest_updated",
        "data": nest.to_dict(),
    })
    
    return nest_to_response(nest)


@router.delete("/nests/{nest_id}", response_model=ApiResponse)
async def delete_nest(nest_id: str):
    scheduler.remove_nest(nest_id)
    
    await broadcast_to_websockets({
        "type": "nest_deleted",
        "data": {"id": nest_id},
    })
    
    return ApiResponse(success=True, message="Nest deleted successfully")


@router.post("/schedule", response_model=SchedulingResponse)
async def run_scheduling(request: SchedulingRequest):
    drones = scheduler.get_all_drones()
    nests = scheduler.get_all_nests()
    
    if request.drone_ids:
        drones = [d for d in drones if d.id in request.drone_ids]
    if request.nest_ids:
        nests = [n for n in nests if n.id in request.nest_ids]
    
    scheduler.engine.algorithm = request.algorithm
    
    result = scheduler.engine.schedule(drones, nests)
    
    if result.matched_pairs:
        scheduler.apply_matchings(result.matched_pairs)
    
    return SchedulingResponse(
        success=True,
        matched_pairs=[
            MatchingResultSchema(
                drone_id=m.drone_id,
                nest_id=m.nest_id,
                advantage_value=m.advantage_value,
                travel_time=m.travel_time,
                energy_cost=m.energy_cost,
                timestamp=m.timestamp,
            )
            for m in result.matched_pairs
        ],
        total_advantage=result.total_advantage,
        computation_time=result.computation_time,
        drones_matched=result.drones_matched,
        nests_used=result.nests_used,
        energy_saved=result.energy_saved,
    )


@router.post("/scheduler/start", response_model=ApiResponse)
async def start_scheduler():
    if scheduler.engine.state.value == "running":
        return ApiResponse(success=False, message="Scheduler already running")
    
    asyncio.create_task(scheduler.run())
    
    return ApiResponse(success=True, message="Scheduler started")


@router.post("/scheduler/stop", response_model=ApiResponse)
async def stop_scheduler():
    scheduler.stop()
    return ApiResponse(success=True, message="Scheduler stopped")


@router.get("/scheduler/status", response_model=SchedulerStatus)
async def get_scheduler_status():
    status = scheduler.engine.get_status()
    return SchedulerStatus(**status)


@router.get("/metrics", response_model=MetricsResponse)
async def get_metrics():
    metrics = scheduler.engine.get_metrics()
    return MetricsResponse(**metrics)


@router.post("/simulation/start", response_model=ApiResponse)
async def start_simulation(config: SimulationConfig):
    global simulation_task, simulation_status
    
    if simulation_status["is_running"]:
        return ApiResponse(success=False, message="Simulation already running")
    
    simulation_status["is_running"] = True
    simulation_status["progress"] = 0.0
    simulation_status["current_step"] = 0
    simulation_status["total_steps"] = int(config.duration_hours * 3600)
    
    async def run_sim():
        from simulation import DataSimulator
        import time
        
        sim = DataSimulator(
            output_dir=config.output_dir,
            num_nests=config.num_nests,
            num_drones_fixed=config.num_drones_fixed,
            num_drones_periodic=config.num_drones_periodic,
            num_drones_emergency=config.num_drones_emergency,
        )
        
        start_time = time.time()
        
        for step in range(simulation_status["total_steps"]):
            sim.step()
            
            simulation_status["current_step"] = step + 1
            simulation_status["progress"] = (step + 1) / simulation_status["total_steps"] * 100
            simulation_status["elapsed_time"] = time.time() - start_time
            
            if step > 0:
                simulation_status["eta"] = (
                    simulation_status["elapsed_time"] / step * 
                    (simulation_status["total_steps"] - step)
                )
            
            if step % 1000 == 0:
                for drone in sim.drones:
                    scheduler.update_drone(drone)
                for nest in sim.nests:
                    scheduler.update_nest(nest)
                
                await broadcast_to_websockets({
                    "type": "simulation_progress",
                    "data": simulation_status,
                })
        
        sim.export_all()
        simulation_status["is_running"] = False
        
        await broadcast_to_websockets({
            "type": "simulation_complete",
            "data": sim.get_statistics(),
        })
    
    simulation_task = asyncio.create_task(run_sim())
    
    return ApiResponse(success=True, message="Simulation started")


@router.get("/simulation/status", response_model=SimulationStatus)
async def get_simulation_status():
    return SimulationStatus(**simulation_status)


@router.post("/simulation/stop", response_model=ApiResponse)
async def stop_simulation():
    global simulation_status
    
    if simulation_task:
        simulation_task.cancel()
    
    simulation_status["is_running"] = False
    
    return ApiResponse(success=True, message="Simulation stopped")


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    websocket_connections.append(websocket)
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
            elif message.get("type") == "get_state":
                state = scheduler.get_state()
                await websocket.send_json({
                    "type": "state_update",
                    "data": state,
                })
    except WebSocketDisconnect:
        websocket_connections.remove(websocket)


from api.schemas import PositionSchema, GATTrainRequest, GATTrainStatus

training_status: Dict[str, Any] = {
    "is_training": False,
    "current_epoch": 0,
    "total_epochs": 0,
    "train_loss": 0.0,
    "val_loss": 0.0,
    "best_val_loss": float("inf"),
    "progress": 0.0,
}
training_task: Optional[asyncio.Task] = None


@router.post("/training/start", response_model=ApiResponse)
async def start_training(config: GATTrainRequest):
    global training_task, training_status
    
    if training_status["is_training"]:
        return ApiResponse(success=False, message="Training already in progress")
    
    training_status["is_training"] = True
    training_status["total_epochs"] = config.epochs
    training_status["current_epoch"] = 0
    training_status["best_val_loss"] = float("inf")
    
    async def run_training():
        from training import Trainer
        
        trainer = Trainer(
            algorithm="dqn",
            num_drones=50,
            num_nests=20,
            num_episodes=config.epochs,
            max_steps_per_episode=500,
            learning_rate=config.learning_rate,
            save_dir=os.path.dirname(config.save_path),
        )
        
        def progress_callback(epoch, metrics):
            training_status["current_epoch"] = epoch
            training_status["train_loss"] = metrics.get("loss", 0)
            training_status["val_loss"] = metrics.get("val_loss", 0)
            training_status["progress"] = epoch / config.epochs * 100
            
            if metrics.get("val_loss", float("inf")) < training_status["best_val_loss"]:
                training_status["best_val_loss"] = metrics["val_loss"]
        
        try:
            history = trainer.train()
            
            await broadcast_to_websockets({
                "type": "training_complete",
                "data": {
                    "epochs": config.epochs,
                    "best_val_loss": training_status["best_val_loss"],
                    "final_train_loss": training_status["train_loss"],
                }
            })
        except Exception as e:
            await broadcast_to_websockets({
                "type": "training_error",
                "data": {"error": str(e)}
            })
        finally:
            training_status["is_training"] = False
    
    training_task = asyncio.create_task(run_training())
    
    return ApiResponse(success=True, message="Training started")


@router.get("/training/status", response_model=GATTrainStatus)
async def get_training_status():
    return GATTrainStatus(**training_status)


@router.post("/training/stop", response_model=ApiResponse)
async def stop_training():
    global training_status, training_task
    
    if training_task:
        training_task.cancel()
    
    training_status["is_training"] = False
    
    return ApiResponse(success=True, message="Training stopped")


@router.post("/training/generate-data", response_model=ApiResponse)
async def generate_training_data(
    num_episodes: int = 100,
    episode_length: int = 500,
    output_dir: str = "data/training",
):
    from training import TrainingDataGenerator
    
    generator = TrainingDataGenerator(
        output_dir=output_dir,
        num_episodes=num_episodes,
        episode_length=episode_length,
    )
    
    output_path = generator.generate_dataset()
    
    return ApiResponse(
        success=True,
        message=f"Generated {num_episodes} episodes",
        data={"output_path": output_path}
    )


from api.schemas import PositionSchema
