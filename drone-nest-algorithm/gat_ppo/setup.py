from setuptools import find_packages, setup


setup(
    name="gat-ppo",
    packages=find_packages(),
    version="0.0.1",
    install_requires=["numpy", "torch"],
)
