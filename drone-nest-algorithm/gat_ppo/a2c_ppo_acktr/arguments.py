import argparse

import torch


# 只保留当前 GAT + PPO 主循环真正会用到的训练参数。
def get_args():
    parser = argparse.ArgumentParser(description="GAT + PPO training")

    # PPO 优化相关参数。
    parser.add_argument("--lr", type=float, default=7e-4)
    parser.add_argument("--eps", type=float, default=1e-5)
    parser.add_argument("--gamma", type=float, default=0.99)
    parser.add_argument("--use-gae", action="store_true", default=False)
    parser.add_argument("--gae-lambda", type=float, default=0.95)
    parser.add_argument("--entropy-coef", type=float, default=0.01)
    parser.add_argument("--value-loss-coef", type=float, default=0.5)
    parser.add_argument("--max-grad-norm", type=float, default=0.5)

    # rollout 和 mini-batch 规模。
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--num-processes", type=int, default=16)
    parser.add_argument("--num-steps", type=int, default=5)
    parser.add_argument("--ppo-epoch", type=int, default=4)
    parser.add_argument("--num-mini-batch", type=int, default=32)
    parser.add_argument("--clip-param", type=float, default=0.2)
    parser.add_argument("--log-interval", type=int, default=10)
    parser.add_argument("--num-env-steps", type=int, default=int(10e6))

    # 运行设备和日志设置。
    parser.add_argument("--log-dir", default="/tmp/gat_ppo/")
    parser.add_argument("--save-dir", default="checkpoints")
    parser.add_argument("--save-interval", type=int, default=100)
    parser.add_argument("--no-cuda", action="store_true", default=False)
    parser.add_argument(
        "--use-proper-time-limits", action="store_true", default=False
    )
    parser.add_argument("--use-linear-lr-decay", action="store_true", default=False)

    args = parser.parse_args()

    # 默认优先使用 CUDA；传 --no-cuda 时强制使用 CPU。
    args.cuda = not args.no_cuda and torch.cuda.is_available()

    return args
