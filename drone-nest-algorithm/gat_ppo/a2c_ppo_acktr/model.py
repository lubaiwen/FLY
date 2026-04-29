import torch
import torch.nn as nn

from models import DroneDockGAT


# PPO 需要策略网络提供 act、get_value、evaluate_actions 三个接口。
# 这个类把无人机-机槽 GAT 包装成 PPO 可以直接训练的 Actor-Critic。
class GATPolicy(nn.Module):
    def __init__(self, num_drones, num_docks, nfeat_drone, nfeat_dock, nhid, nheads):
        super(GATPolicy, self).__init__()
        # 保存图结构规模，用于把一维观测重新切回图数据。
        self.num_drones = num_drones
        self.num_docks = num_docks
        self.nfeat_drone = nfeat_drone
        self.nfeat_dock = nfeat_dock

        # GAT 特征提取器：从无人机特征、机槽特征和邻接矩阵中提取图表示。
        self.gat = DroneDockGAT(
            nfeat_drone, nfeat_dock, nhid, dropout=0.1, alpha=0.2, nheads=nheads
        )

        # Critic：把所有无人机的图特征拼起来，估计当前全局状态价值。
        self.critic = nn.Sequential(
            nn.Linear(nhid * num_drones, 64),
            nn.ReLU(),
            nn.Linear(64, 1),
        )

        # Actor：把无人机和机槽特征投影到同一动作打分空间。
        self.actor_drone = nn.Linear(nhid, nhid)
        self.actor_dock = nn.Linear(nhid, nhid)

        # 当前策略不使用 RNN，但保留这两个字段以兼容 PPO 存储和调用接口。
        self.is_recurrent = False
        self.recurrent_hidden_state_size = 1

    def _unpack_obs(self, obs):
        # 模拟器传进来的是一维拼接观测：
        # [所有无人机特征 | 所有机槽特征 | 无人机-机槽邻接矩阵]。
        batch_size = obs.shape[0]
        size_drone = self.num_drones * self.nfeat_drone
        size_dock = self.num_docks * self.nfeat_dock

        # 切回 GAT 需要的三个张量。
        raw_drone = obs[:, :size_drone].view(
            batch_size, self.num_drones, self.nfeat_drone
        )
        raw_dock = obs[:, size_drone : size_drone + size_dock].view(
            batch_size, self.num_docks, self.nfeat_dock
        )
        adj = obs[:, size_drone + size_dock :].view(
            batch_size, self.num_drones, self.num_docks
        )

        return raw_drone, raw_dock, adj

    def _get_actor_critic(self, inputs):
        # 统一的前向逻辑，同时产出 Critic value 和 Actor logits。
        raw_drone, raw_dock, adj = self._unpack_obs(inputs)
        batch_size = inputs.shape[0]

        values = []
        valid_scores_list = []

        for b in range(batch_size):
            # 当前 DroneDockGAT 按单张图计算，所以这里逐个 batch 样本喂入。
            h_prime_drone, h_dock = self.gat(raw_drone[b], raw_dock[b], adj[b])

            # Critic 对整个无人机群的图特征做全局价值估计。
            values.append(self.critic(h_prime_drone.reshape(-1)))

            # Actor 用无人机特征和机槽特征做点积，得到每架无人机选择每个机槽的分数。
            q_drone = self.actor_drone(h_prime_drone)
            k_dock = self.actor_dock(h_dock)
            action_scores = torch.matmul(q_drone, k_dock.T)

            # 用邻接矩阵屏蔽不可连接边，避免策略选到物理上不允许的匹配。
            zero_vec = -9e15 * torch.ones_like(action_scores)
            valid_scores = torch.where(adj[b] > 0, action_scores, zero_vec)
            valid_scores_list.append(valid_scores)

        # 重新打包成 PPO 批量训练需要的 batch 形状。
        values = torch.stack(values)
        logits = torch.stack(valid_scores_list)

        return values, logits

    def act(self, inputs, rnn_hxs, masks, deterministic=False):
        # 采样阶段：根据 logits 构造分类分布，为每架无人机选择一个机槽。
        value, logits = self._get_actor_critic(inputs)
        dist = torch.distributions.Categorical(logits=logits)

        if deterministic:
            action = logits.argmax(dim=-1)
        else:
            action = dist.sample()

        # 多架无人机的动作共同构成一个联合动作，log_prob 按无人机维度相加。
        action_log_probs = dist.log_prob(action).sum(dim=1, keepdim=True)

        return value, action, action_log_probs, rnn_hxs

    def get_value(self, inputs, rnn_hxs, masks):
        # PPO 计算 bootstrap return 时只需要价值函数。
        value, _ = self._get_actor_critic(inputs)
        return value

    def evaluate_actions(self, inputs, rnn_hxs, masks, action):
        # 更新阶段：重新评估旧动作的 log_prob 和 entropy，用于 PPO 损失。
        value, logits = self._get_actor_critic(inputs)
        dist = torch.distributions.Categorical(logits=logits)

        action_log_probs = dist.log_prob(action).sum(dim=1, keepdim=True)
        dist_entropy = dist.entropy().mean()

        return value, action_log_probs, dist_entropy, rnn_hxs
