import os
import sys
import time
from collections import deque

import numpy as np
import torch

ALGO_ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(ALGO_ROOT, ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from a2c_ppo_acktr import utils
from a2c_ppo_acktr.algo.ppo import PPO
from a2c_ppo_acktr.arguments import get_args
from a2c_ppo_acktr.model import GATPolicy
from a2c_ppo_acktr.storage import RolloutStorage
from simulator import DRONE_FEATURES, NEST_FEATURES, DroneChargingEnv, EnvConfig


class BoxSpace:
    def __init__(self, shape):
        self.shape = tuple(shape)


class MultiDiscreteSpace:
    def __init__(self, shape, nvec):
        self.shape = tuple(shape)
        self.nvec = tuple(nvec)


class RealDroneEnv:
    """把 DroneChargingEnv 包装成当前 PPO 主循环需要的向量化环境接口。"""

    def __init__(
        self,
        num_processes,
        num_drones,
        num_docks,
        nfeat_drone,
        nfeat_dock,
        device,
        seed=None,
    ):
        self.num_processes = num_processes
        self.num_drones = num_drones
        self.num_docks = num_docks
        self.nfeat_drone = nfeat_drone
        self.nfeat_dock = nfeat_dock
        self.device = device

        self.envs = []
        base_seed = seed if seed is not None else 0
        for idx in range(num_processes):
            config = EnvConfig(
                num_drones=num_drones,
                num_nests=num_docks,
                seed=base_seed + idx,
            )
            self.envs.append(DroneChargingEnv(config))

        obs_dim = (
            num_drones * nfeat_drone
            + num_docks * nfeat_dock
            + num_drones * num_docks
        )
        self.observation_space = BoxSpace((obs_dim,))
        self.action_space = MultiDiscreteSpace(
            (num_drones,),
            [num_docks for _ in range(num_drones)],
        )
        self.episode_rewards = [0.0 for _ in range(num_processes)]
        self.episode_lengths = [0 for _ in range(num_processes)]

    def reset(self):
        observations = []
        for env in self.envs:
            obs = env.reset()
            observations.append(obs.flat_observation)
        return self._obs_tensor(observations)

    def step(self, actions):
        if torch.is_tensor(actions):
            action_rows = actions.detach().cpu().long().tolist()
        else:
            action_rows = actions

        observations = []
        rewards = []
        dones = []
        infos = []

        for idx, (env, action) in enumerate(zip(self.envs, action_rows)):
            obs, reward, done, info = env.step(action)
            self.episode_rewards[idx] += float(reward)
            self.episode_lengths[idx] += 1

            if done:
                info = dict(info)
                info["episode"] = {
                    "r": self.episode_rewards[idx],
                    "l": self.episode_lengths[idx],
                }
                info["bad_transition"] = True
                obs = env.reset()
                self.episode_rewards[idx] = 0.0
                self.episode_lengths[idx] = 0

            observations.append(obs.flat_observation)
            rewards.append([float(reward)])
            dones.append(done)
            infos.append(info)

        return (
            self._obs_tensor(observations),
            torch.tensor(rewards, dtype=torch.float32, device=self.device),
            dones,
            infos,
        )

    def _obs_tensor(self, observations):
        return torch.tensor(observations, dtype=torch.float32, device=self.device)


def resolve_save_dir(save_dir):
    save_dir = os.path.expanduser(save_dir)
    if not os.path.isabs(save_dir):
        save_dir = os.path.join(ALGO_ROOT, save_dir)
    os.makedirs(save_dir, exist_ok=True)
    return save_dir


def save_checkpoint(
    path,
    actor_critic,
    agent,
    args,
    update,
    total_num_steps,
    metrics,
    num_drones,
    num_docks,
    nfeat_drone,
    nfeat_dock,
):
    checkpoint = {
        "model_state_dict": actor_critic.state_dict(),
        "optimizer_state_dict": agent.optimizer.state_dict(),
        "args": vars(args),
        "update": update,
        "total_num_steps": total_num_steps,
        "metrics": metrics,
        "num_drones": num_drones,
        "num_docks": num_docks,
        "nfeat_drone": nfeat_drone,
        "nfeat_dock": nfeat_dock,
        "drone_features": list(DRONE_FEATURES),
        "nest_features": list(NEST_FEATURES),
        "env_config": {
            "num_drones": num_drones,
            "num_nests": num_docks,
            "max_steps": EnvConfig().max_steps,
            "dt": EnvConfig().dt,
            "low_battery_threshold": EnvConfig().low_battery_threshold,
            "min_safe_battery": EnvConfig().min_safe_battery,
        },
    }
    torch.save(checkpoint, path)


# 当前训练入口：无人机-机槽匹配任务的 GAT + PPO 主循环。
def main():
    args = get_args()

    # 固定随机种子，方便复现实验结果。
    torch.manual_seed(args.seed)
    torch.cuda.manual_seed_all(args.seed)

    # 清理日志目录里旧的 monitor 文件，避免新旧训练日志混在一起。
    log_dir = os.path.expanduser(args.log_dir)
    utils.cleanup_log_dir(log_dir)

    torch.set_num_threads(1)
    device = torch.device("cuda:0" if args.cuda else "cpu")

    # 当前无人机-机槽图的基础规模和特征维度，直接和模拟器保持一致。
    sim_config = EnvConfig()
    num_drones = sim_config.num_drones
    num_docks = sim_config.num_nests
    nfeat_drone = len(DRONE_FEATURES)
    nfeat_dock = len(NEST_FEATURES)
    nhid = 64
    nheads = 4
    save_dir = resolve_save_dir(args.save_dir)

    # 这里接入你的模拟器环境。
    # RealDroneEnv 后续需要提供 observation_space、action_space、reset、step。
    envs = RealDroneEnv(
        args.num_processes,
        num_drones,
        num_docks,
        nfeat_drone,
        nfeat_dock,
        device,
        seed=args.seed,
    )

    # GATPolicy 是 PPO 能直接调用的策略网络：
    # 内部用 DroneDockGAT 提取图特征，再输出价值函数和匹配动作。
    actor_critic = GATPolicy(
        num_drones, num_docks, nfeat_drone, nfeat_dock, nhid, nheads
    )
    actor_critic.to(device)

    # PPO 算法核心：负责用 rollout 里的数据更新 GATPolicy 参数。
    agent = PPO(
        actor_critic,
        args.clip_param,
        args.ppo_epoch,
        args.num_mini_batch,
        args.value_loss_coef,
        args.entropy_coef,
        lr=args.lr,
        eps=args.eps,
        max_grad_norm=args.max_grad_norm,
    )

    # RolloutStorage 是 PPO 的经验缓存，保存多步交互数据。
    rollouts = RolloutStorage(
        args.num_steps,
        args.num_processes,
        envs.observation_space.shape,
        envs.action_space,
        actor_critic.recurrent_hidden_state_size,
    )

    # 初始化环境，把第一帧观测放进 rollout 的第 0 个位置。
    obs = envs.reset()
    rollouts.obs[0].copy_(obs)
    rollouts.to(device)

    episode_rewards = deque(maxlen=10)

    start = time.time()
    num_updates = int(args.num_env_steps) // args.num_steps // args.num_processes

    print("Start GAT + PPO training.")
    print(f"Checkpoints will be saved to {save_dir}")

    best_score = -float("inf")
    best_score_name = None
    last_update = -1
    last_metrics = {}

    try:
        for j in range(num_updates):
            last_update = j

            # 可选的线性学习率衰减，训练越往后学习率越小。
            if args.use_linear_lr_decay:
                utils.update_linear_schedule(agent.optimizer, j, num_updates, args.lr)

            # 阶段 1：用当前策略和模拟器交互，收集一段 rollout。
            rollout_rewards = []
            for step in range(args.num_steps):
                with torch.no_grad():
                    # act 返回 critic 估值、动作、动作 log_prob 和隐藏状态占位。
                    value, action, action_log_prob, recurrent_hidden_states = (
                        actor_critic.act(
                            rollouts.obs[step],
                            rollouts.recurrent_hidden_states[step],
                            rollouts.masks[step],
                        )
                    )

                # 把匹配动作交给模拟器，得到下一步观测、奖励和终止信号。
                obs, reward, done, infos = envs.step(action)
                rollout_rewards.append(reward.mean().item())

                for info in infos:
                    if "episode" in info.keys():
                        episode_rewards.append(info["episode"]["r"])

                # masks 标记 episode 是否结束；bad_masks 用于处理时间限制截断。
                masks = torch.FloatTensor(
                    [[0.0] if done_ else [1.0] for done_ in done]
                ).to(device)
                bad_masks = torch.FloatTensor(
                    [
                        [0.0] if "bad_transition" in info.keys() else [1.0]
                        for info in infos
                    ]
                ).to(device)

                # 把当前 step 的交互结果写入 PPO 缓存。
                rollouts.insert(
                    obs,
                    recurrent_hidden_states,
                    action,
                    action_log_prob,
                    value,
                    reward,
                    masks,
                    bad_masks,
                )

            # 阶段 2：用最后一个状态的价值估计 bootstrap 回报。
            with torch.no_grad():
                next_value = actor_critic.get_value(
                    rollouts.obs[-1],
                    rollouts.recurrent_hidden_states[-1],
                    rollouts.masks[-1],
                ).detach()

            # 根据奖励、折扣因子和可选 GAE 计算 returns。
            rollouts.compute_returns(
                next_value,
                args.use_gae,
                args.gamma,
                args.gae_lambda,
                args.use_proper_time_limits,
            )

            # 用整段 rollout 执行 PPO 多轮小批量更新。
            value_loss, action_loss, dist_entropy = agent.update(rollouts)

            # 更新后把最后一个观测滚到缓存开头，作为下一段 rollout 的起点。
            rollouts.after_update()

            total_num_steps = (j + 1) * args.num_processes * args.num_steps
            mean_rollout_reward = float(np.mean(rollout_rewards))
            if episode_rewards:
                score = float(np.mean(episode_rewards))
                score_name = "mean_episode_reward"
                mean_episode_reward = f"{score:.2f}"
            else:
                score = mean_rollout_reward
                score_name = "mean_rollout_reward"
                mean_episode_reward = "n/a"

            last_metrics = {
                "mean_rollout_reward": mean_rollout_reward,
                "mean_episode_reward": None if not episode_rewards else score,
                "score": score,
                "score_name": score_name,
                "value_loss": float(value_loss),
                "action_loss": float(action_loss),
                "dist_entropy": float(dist_entropy),
            }

            if score_name != best_score_name:
                best_score = -float("inf")
                best_score_name = score_name

            if score > best_score:
                best_score = score
                save_checkpoint(
                    os.path.join(save_dir, "best_model.pt"),
                    actor_critic,
                    agent,
                    args,
                    j,
                    total_num_steps,
                    last_metrics,
                    num_drones,
                    num_docks,
                    nfeat_drone,
                    nfeat_dock,
                )

            should_save_latest = (
                args.save_interval > 0
                and (j == 0 or (j + 1) % args.save_interval == 0)
            )
            if should_save_latest:
                save_checkpoint(
                    os.path.join(save_dir, "latest_model.pt"),
                    actor_critic,
                    agent,
                    args,
                    j,
                    total_num_steps,
                    last_metrics,
                    num_drones,
                    num_docks,
                    nfeat_drone,
                    nfeat_dock,
                )

            # 阶段 3：打印训练日志。
            if j % args.log_interval == 0:
                end = time.time()
                print(f"Updates {j}, FPS {int(total_num_steps / (end - start))}")
                print(
                    f"Mean Episode Reward: {mean_episode_reward} | "
                    f"Mean Rollout Reward: {mean_rollout_reward:.2f} | "
                    f"Action Loss: {action_loss:.4f} | "
                    f"Value Loss: {value_loss:.4f} | "
                    f"Entropy: {dist_entropy:.4f}\n"
                )

    except KeyboardInterrupt:
        total_num_steps = max(0, last_update + 1) * args.num_processes * args.num_steps
        save_checkpoint(
            os.path.join(save_dir, "interrupted_model.pt"),
            actor_critic,
            agent,
            args,
            last_update,
            total_num_steps,
            last_metrics,
            num_drones,
            num_docks,
            nfeat_drone,
            nfeat_dock,
        )
        save_checkpoint(
            os.path.join(save_dir, "latest_model.pt"),
            actor_critic,
            agent,
            args,
            last_update,
            total_num_steps,
            last_metrics,
            num_drones,
            num_docks,
            nfeat_drone,
            nfeat_dock,
        )
        print(f"Training interrupted. Checkpoint saved to {save_dir}")
        return

    total_num_steps = max(0, last_update + 1) * args.num_processes * args.num_steps
    save_checkpoint(
        os.path.join(save_dir, "final_model.pt"),
        actor_critic,
        agent,
        args,
        last_update,
        total_num_steps,
        last_metrics,
        num_drones,
        num_docks,
        nfeat_drone,
        nfeat_dock,
    )
    save_checkpoint(
        os.path.join(save_dir, "latest_model.pt"),
        actor_critic,
        agent,
        args,
        last_update,
        total_num_steps,
        last_metrics,
        num_drones,
        num_docks,
        nfeat_drone,
        nfeat_dock,
    )
    print(f"Training finished. Final checkpoint saved to {save_dir}")


if __name__ == "__main__":
    main()
