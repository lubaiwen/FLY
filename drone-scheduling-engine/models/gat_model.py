import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import GATConv, global_mean_pool
from torch_geometric.data import Data, DataLoader
import numpy as np
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass
from datetime import datetime
import os

from config import settings
from models import Drone, Nest, Position


@dataclass
class GraphNode:
    node_id: str
    node_type: str
    features: np.ndarray


@dataclass
class GraphEdge:
    source_id: str
    target_id: str
    edge_type: str
    weight: float = 1.0


class SpatialTemporalGraphBuilder:
    
    def __init__(
        self,
        input_dim: int = 32,
        time_window: int = 10,
        spatial_radius: float = 5000,
    ):
        self.input_dim = input_dim
        self.time_window = time_window
        self.spatial_radius = spatial_radius
    
    def build_graph(
        self,
        drones: List[Drone],
        nests: List[Nest],
        timestamp: datetime = None,
        historical_data: Dict = None,
    ) -> Data:
        nodes = []
        node_ids = []
        node_types = []
        
        for drone in drones:
            features = self._extract_drone_features(drone, historical_data)
            nodes.append(features)
            node_ids.append(f"drone_{drone.id}")
            node_types.append("drone")
        
        for nest in nests:
            features = self._extract_nest_features(nest, historical_data)
            nodes.append(features)
            node_ids.append(f"nest_{nest.id}")
            node_types.append("nest")
        
        if not nodes:
            return Data(
                x=torch.zeros((0, self.input_dim)),
                edge_index=torch.zeros((2, 0), dtype=torch.long),
                edge_attr=torch.zeros((0, 1)),
            )
        
        x = torch.tensor(np.array(nodes), dtype=torch.float)
        
        edge_index = []
        edge_attr = []
        
        for i, drone in enumerate(drones):
            for j, nest in enumerate(nests):
                distance = drone.position.distance_to(nest.position)
                if distance <= self.spatial_radius:
                    edge_index.append([i, len(drones) + j])
                    edge_attr.append([1.0 - distance / self.spatial_radius])
                    
                    edge_index.append([len(drones) + j, i])
                    edge_attr.append([1.0 - distance / self.spatial_radius])
        
        for i, nest_i in enumerate(nests):
            for j, nest_j in enumerate(nests):
                if i < j:
                    distance = nest_i.position.distance_to(nest_j.position)
                    if distance <= self.spatial_radius:
                        ni = len(drones) + i
                        nj = len(drones) + j
                        edge_index.append([ni, nj])
                        edge_attr.append([1.0 - distance / self.spatial_radius])
        
        if edge_index:
            edge_index = torch.tensor(edge_index, dtype=torch.long).t()
            edge_attr = torch.tensor(edge_attr, dtype=torch.float)
        else:
            edge_index = torch.zeros((2, 0), dtype=torch.long)
            edge_attr = torch.zeros((0, 1), dtype=torch.float)
        
        return Data(
            x=x,
            edge_index=edge_index,
            edge_attr=edge_attr,
            node_ids=node_ids,
            node_types=node_types,
        )
    
    def _extract_drone_features(
        self,
        drone: Drone,
        historical_data: Dict = None,
    ) -> np.ndarray:
        features = np.zeros(self.input_dim)
        
        features[0] = drone.position.lat
        features[1] = drone.position.lon
        features[2] = drone.position.altitude / 500.0
        features[3] = drone.energy / drone.max_energy
        features[4] = drone.speed / 30.0
        features[5] = drone.energy_consumption_rate
        features[6] = drone.task_priority / 2.0
        
        type_encoding = {
            "fixed_route": [1, 0, 0],
            "periodic_patrol": [0, 1, 0],
            "emergency_rescue": [0, 0, 1],
        }
        type_vec = type_encoding.get(drone.drone_type, [0, 0, 0])
        features[7:10] = type_vec
        
        status_encoding = {
            "idle": [1, 0, 0, 0, 0],
            "flying": [0, 1, 0, 0, 0],
            "charging": [0, 0, 1, 0, 0],
            "on_mission": [0, 0, 0, 1, 0],
            "returning": [0, 0, 0, 0, 1],
        }
        status_vec = status_encoding.get(drone.status.value, [0, 0, 0, 0, 0])
        features[10:15] = status_vec
        
        if historical_data and drone.id in historical_data:
            hist = historical_data[drone.id]
            features[15:20] = hist.get("recent_energy_trend", [0] * 5)
            features[20:25] = hist.get("recent_distance_trend", [0] * 5)
        
        return features
    
    def _extract_nest_features(
        self,
        nest: Nest,
        historical_data: Dict = None,
    ) -> np.ndarray:
        features = np.zeros(self.input_dim)
        
        features[0] = nest.position.lat
        features[1] = nest.position.lon
        features[2] = nest.capacity / 10.0
        features[3] = nest.available_slots() / nest.capacity
        features[4] = nest.demand_density
        features[5] = nest.historical_usage_rate
        
        region_encoding = {
            "commercial": [1, 0, 0, 0],
            "residential": [0, 1, 0, 0],
            "industrial": [0, 0, 1, 0],
            "emergency": [0, 0, 0, 1],
        }
        region_vec = region_encoding.get(nest.region_type, [0, 0, 0, 0])
        features[6:10] = region_vec
        
        if historical_data and nest.id in historical_data:
            hist = historical_data[nest.id]
            features[10:15] = hist.get("hourly_usage_pattern", [0] * 5)
            features[15:20] = hist.get("daily_demand_trend", [0] * 5)
            features[20:25] = hist.get("peak_hours_indicator", [0] * 5)
        
        return features


class GATLayer(nn.Module):
    
    def __init__(
        self,
        in_dim: int,
        out_dim: int,
        num_heads: int = 4,
        dropout: float = 0.1,
        concat: bool = True,
    ):
        super().__init__()
        self.in_dim = in_dim
        self.out_dim = out_dim
        self.num_heads = num_heads
        
        if concat:
            self.gat = GATConv(
                in_dim,
                out_dim,
                heads=num_heads,
                dropout=dropout,
                concat=True,
            )
            self.out_features = out_dim * num_heads
        else:
            self.gat = GATConv(
                in_dim,
                out_dim,
                heads=num_heads,
                dropout=dropout,
                concat=False,
            )
            self.out_features = out_dim
        
        self.dropout = nn.Dropout(dropout)
        self.layer_norm = nn.LayerNorm(self.out_features)
    
    def forward(self, x, edge_index, edge_attr=None):
        out = self.gat(x, edge_index, edge_attr)
        out = self.layer_norm(out)
        out = F.elu(out)
        out = self.dropout(out)
        return out


class GATValueNetwork(nn.Module):
    
    def __init__(
        self,
        input_dim: int = None,
        hidden_dim: int = None,
        output_dim: int = None,
        num_heads: int = None,
        num_layers: int = None,
        dropout: float = None,
    ):
        super().__init__()
        
        config = settings.gat
        self.input_dim = input_dim or config.input_dim
        self.hidden_dim = hidden_dim or config.hidden_dim
        self.output_dim = output_dim or config.output_dim
        self.num_heads = num_heads or config.num_heads
        self.num_layers = num_layers or config.num_layers
        self.dropout = dropout or config.dropout
        
        self.input_projection = nn.Linear(self.input_dim, self.hidden_dim)
        
        self.gat_layers = nn.ModuleList()
        
        self.gat_layers.append(
            GATLayer(self.hidden_dim, self.hidden_dim, self.num_heads, self.dropout, concat=True)
        )
        
        for _ in range(self.num_layers - 2):
            self.gat_layers.append(
                GATLayer(
                    self.hidden_dim * self.num_heads,
                    self.hidden_dim,
                    self.num_heads,
                    self.dropout,
                    concat=True,
                )
            )
        
        self.gat_layers.append(
            GATLayer(
                self.hidden_dim * self.num_heads,
                self.hidden_dim,
                self.num_heads,
                self.dropout,
                concat=False,
            )
        )
        
        self.value_head = nn.Sequential(
            nn.Linear(self.hidden_dim, self.hidden_dim // 2),
            nn.ELU(),
            nn.Dropout(self.dropout),
            nn.Linear(self.hidden_dim // 2, self.output_dim),
        )
        
        self.temporal_attention = nn.MultiheadAttention(
            embed_dim=self.output_dim,
            num_heads=2,
            dropout=self.dropout,
            batch_first=True,
        )
    
    def forward(self, data: Data, temporal_data: List[Data] = None):
        x, edge_index = data.x, data.edge_index
        
        x = self.input_projection(x)
        x = F.elu(x)
        
        for gat_layer in self.gat_layers:
            x = gat_layer(x, edge_index)
        
        values = self.value_head(x)
        
        if temporal_data and len(temporal_data) > 0:
            temporal_values = [values.unsqueeze(1)]
            for t_data in temporal_data:
                t_x, t_edge_index = t_data.x, t_data.edge_index
                t_x = self.input_projection(t_x)
                t_x = F.elu(t_x)
                for gat_layer in self.gat_layers:
                    t_x = gat_layer(t_x, t_edge_index)
                t_values = self.value_head(t_x)
                temporal_values.append(t_values.unsqueeze(1))
            
            temporal_stack = torch.cat(temporal_values, dim=1)
            attended, _ = self.temporal_attention(
                temporal_stack, temporal_stack, temporal_stack
            )
            values = attended[:, 0, :]
        
        return values
    
    def predict_nest_value(
        self,
        data: Data,
        nest_indices: List[int],
    ) -> torch.Tensor:
        values = self.forward(data)
        return values[nest_indices]


class GATTrainer:
    
    def __init__(
        self,
        model: GATValueNetwork = None,
        learning_rate: float = None,
        device: str = None,
    ):
        config = settings.gat
        self.model = model or GATValueNetwork()
        self.learning_rate = learning_rate or config.learning_rate
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        
        self.model.to(self.device)
        self.optimizer = torch.optim.Adam(
            self.model.parameters(),
            lr=self.learning_rate,
            weight_decay=1e-5,
        )
        self.scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
            self.optimizer, mode="min", factor=0.5, patience=10
        )
        
        self.graph_builder = SpatialTemporalGraphBuilder()
        self.training_history = []
    
    def train_epoch(
        self,
        train_loader: DataLoader,
        epoch: int,
    ) -> Dict[str, float]:
        self.model.train()
        total_loss = 0.0
        total_samples = 0
        
        for batch in train_loader:
            batch = batch.to(self.device)
            
            self.optimizer.zero_grad()
            
            predicted_values = self.model(batch)
            
            target_values = self._generate_targets(batch).to(self.device)
            
            loss = F.mse_loss(predicted_values, target_values)
            
            loss.backward()
            torch.nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
            self.optimizer.step()
            
            total_loss += loss.item() * batch.num_graphs
            total_samples += batch.num_graphs
        
        avg_loss = total_loss / total_samples if total_samples > 0 else 0.0
        
        return {"loss": avg_loss}
    
    def validate(
        self,
        val_loader: DataLoader,
    ) -> Dict[str, float]:
        self.model.eval()
        total_loss = 0.0
        total_samples = 0
        
        with torch.no_grad():
            for batch in val_loader:
                batch = batch.to(self.device)
                
                predicted_values = self.model(batch)
                target_values = self._generate_targets(batch).to(self.device)
                
                loss = F.mse_loss(predicted_values, target_values)
                
                total_loss += loss.item() * batch.num_graphs
                total_samples += batch.num_graphs
        
        avg_loss = total_loss / total_samples if total_samples > 0 else 0.0
        
        return {"val_loss": avg_loss}
    
    def _generate_targets(self, batch: Data) -> torch.Tensor:
        num_nodes = batch.x.size(0)
        output_dim = self.model.output_dim
        
        targets = torch.zeros(num_nodes, output_dim)
        
        for i in range(num_nodes):
            if hasattr(batch, "node_types") and i < len(batch.node_types):
                if batch.node_types[i] == "nest":
                    targets[i, 0] = torch.rand(1) * 100
                    targets[i, 1] = torch.rand(1)
                else:
                    targets[i, 0] = torch.rand(1) * 50
                    targets[i, 1] = torch.rand(1)
            else:
                targets[i] = torch.rand(output_dim)
        
        return targets
    
    def train(
        self,
        train_loader: DataLoader,
        val_loader: DataLoader,
        epochs: int = None,
        save_dir: str = "models",
        early_stopping_patience: int = 20,
    ) -> Dict[str, List[float]]:
        epochs = epochs or settings.gat.epochs
        os.makedirs(save_dir, exist_ok=True)
        
        history = {"loss": [], "val_loss": []}
        best_val_loss = float("inf")
        patience_counter = 0
        
        for epoch in range(epochs):
            train_metrics = self.train_epoch(train_loader, epoch)
            val_metrics = self.validate(val_loader)
            
            history["loss"].append(train_metrics["loss"])
            history["val_loss"].append(val_metrics["val_loss"])
            
            self.scheduler.step(val_metrics["val_loss"])
            
            print(f"Epoch {epoch+1}/{epochs} - "
                  f"Loss: {train_metrics['loss']:.4f} - "
                  f"Val Loss: {val_metrics['val_loss']:.4f}")
            
            if val_metrics["val_loss"] < best_val_loss:
                best_val_loss = val_metrics["val_loss"]
                patience_counter = 0
                self.save_model(os.path.join(save_dir, "best_model.pt"))
            else:
                patience_counter += 1
            
            if patience_counter >= early_stopping_patience:
                print(f"Early stopping at epoch {epoch+1}")
                break
        
        self.training_history = history
        return history
    
    def save_model(self, path: str):
        torch.save({
            "model_state_dict": self.model.state_dict(),
            "optimizer_state_dict": self.optimizer.state_dict(),
            "training_history": self.training_history,
        }, path)
    
    def load_model(self, path: str):
        checkpoint = torch.load(path, map_location=self.device)
        self.model.load_state_dict(checkpoint["model_state_dict"])
        self.optimizer.load_state_dict(checkpoint["optimizer_state_dict"])
        if "training_history" in checkpoint:
            self.training_history = checkpoint["training_history"]


class FutureValuePredictor:
    
    def __init__(
        self,
        model_path: str = None,
        device: str = None,
    ):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model = GATValueNetwork().to(self.device)
        self.graph_builder = SpatialTemporalGraphBuilder()
        
        if model_path and os.path.exists(model_path):
            self.load_model(model_path)
        
        self.model.eval()
    
    def load_model(self, path: str):
        checkpoint = torch.load(path, map_location=self.device)
        self.model.load_state_dict(checkpoint["model_state_dict"])
        self.model.eval()
    
    def predict(
        self,
        drone: Drone,
        nest: Nest,
        travel_time: float,
    ) -> float:
        graph_data = self.graph_builder.build_graph([drone], [nest])
        graph_data = graph_data.to(self.device)
        
        with torch.no_grad():
            values = self.model(graph_data)
            
            nest_value = values[1, 0].item()
            
            time_factor = 0.97 ** (travel_time / 60)
            predicted_value = nest_value * time_factor
        
        return predicted_value
    
    def predict_batch(
        self,
        drones: List[Drone],
        nests: List[Nest],
    ) -> np.ndarray:
        if not drones or not nests:
            return np.zeros((len(drones), len(nests)))
        
        graph_data = self.graph_builder.build_graph(drones, nests)
        graph_data = graph_data.to(self.device)
        
        with torch.no_grad():
            values = self.model(graph_data)
            
            nest_values = values[len(drones):, 0].cpu().numpy()
            
            value_matrix = np.tile(nest_values, (len(drones), 1))
        
        return value_matrix
