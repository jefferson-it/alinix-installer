#!/bin/bash
set -e
umount /dev/nvme1n1* 2>/dev/null || true
parted -s /dev/nvme1n1 mklabel gpt
# Disco /dev/nvme1n1 limpo e pronto para particionamento
# Partição 1: /dev/nvme1n1p1 (ext4, /)
# Criando partição 1: 1MiB -> 952846.7109375MiB
parted -s /dev/nvme1n1 mkpart primary 1MiB 952846.7109375MiB
partprobe /dev/nvme1n1
udevadm settle --timeout=10
# Aguardando device /dev//dev/nvme1n1p1 estar disponível
for i in {1..10}; do [ -b /dev//dev/nvme1n1p1 ] && break || sleep 1; done
if [ ! -b /dev//dev/nvme1n1p1 ]; then echo "ERRO: /dev//dev/nvme1n1p1 não foi criado"; exit 1; fi
# Formatando /dev//dev/nvme1n1p1 como ext4
mkfs.ext4 -F /dev//dev/nvme1n1p1
# Partição 2: /dev/nvme1n1p2 (fat32, /boot/efi)
# Criando partição 2: 952846.7109375MiB -> 953870.7109375MiB
parted -s /dev/nvme1n1 mkpart primary 952846.7109375MiB 953870.7109375MiB
partprobe /dev/nvme1n1
udevadm settle --timeout=10
# Aguardando device /dev//dev/nvme1n1p2 estar disponível
for i in {1..10}; do [ -b /dev//dev/nvme1n1p2 ] && break || sleep 1; done
if [ ! -b /dev//dev/nvme1n1p2 ]; then echo "ERRO: /dev//dev/nvme1n1p2 não foi criado"; exit 1; fi
# Formatando /dev//dev/nvme1n1p2 como fat32
mkfs.vfat -F 32 /dev//dev/nvme1n1p2
parted -s /dev/nvme1n1 set 2 esp on
# Finalizando disco /dev/nvme1n1
partprobe /dev/nvme1n1
udevadm settle --timeout=10
parted -s /dev/nvme1n1 print
mkdir -p /mnt/alinix-temp/
mount /dev//dev/nvme1n1p1 /mnt/alinix-temp/
mkdir -p /mnt/alinix-temp/boot/efi
mount /dev//dev/nvme1n1p2 /mnt/alinix-temp/boot/efi