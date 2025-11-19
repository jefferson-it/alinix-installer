import { toDev } from "../../modules/disk/replace.ts";
import { isUEFI } from "../disk/verify.ts";
import { execCmd } from "./exec.ts";
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";

export async function writeGrub() {

    const rootPartition = disks.flatMap(d => d.children)
        .find(p => p.mountPoint === "/")?.name;
    if (!rootPartition) throw new Error("Nenhuma partição raiz ('/') encontrada.");

    const rootDevice = toDev(rootPartition);

    // CORREÇÃO NVME → remove apenas o fim (pNN ou N)
    const diskDevice = rootDevice.includes("nvme")
        ? rootDevice.replace(/p\d+$/, "")
        : rootDevice.replace(/\d+$/, "");

    console.log(`📀 Disco detectado: ${diskDevice}`);
    console.log(`📂 Partição raiz: ${rootDevice}`);

    const grubDefaultPath = path.join(tmpFolder, "etc/default/grub");

    // Criar /etc/default/grub se não existir
    try {
        await Deno.stat(grubDefaultPath);
    } catch {
        console.log("⚠️  Criando /etc/default/grub...");
        const grubConfig = `GRUB_DEFAULT=0
GRUB_TIMEOUT=5
GRUB_DISTRIBUTOR="Alinix"
GRUB_CMDLINE_LINUX_DEFAULT="quiet splash components fsck.mode=skip"
GRUB_CMDLINE_LINUX=""
GRUB_TERMINAL=console
GRUB_DISABLE_OS_PROBER=false
`;
        await Deno.writeTextFile(grubDefaultPath, grubConfig);
    }

    // ---------------------
    //   MODO UEFI
    // ---------------------
    if (await isUEFI()) {
        console.log("💾 Modo UEFI detectado. Instalando GRUB para UEFI...");

        const efiPartition = disks.flatMap(d => d.children)
            .find(p => p.mountPoint === "/boot/efi");

        if (!efiPartition) {
            throw new Error("⚠️  Partição EFI não encontrada!");
        }

        const efiDevice = toDev(efiPartition.name);

        // Número da partição EFI
        const efiPartNum = efiDevice.match(/(\d+)$/)?.[1] ?? "1";

        console.log(`🔧 EFI Device = ${efiDevice}`);
        console.log(`🔧 EFI Partition Number = ${efiPartNum}`);

        await execCmd("chroot", [
            tmpFolder,
            "/bin/bash",
            "-c",
            `
set -e

ROOT_DEVICE="${rootDevice}"

echo "🔍 Verificando kernel instalado..."
if ! ls /boot/vmlinuz* 1>/dev/null 2>&1; then
    echo "❌ ERRO: Nenhum kernel encontrado em /boot!"
    echo "🔍 Procurando em outros locais..."
    
    # Procurar em /boot/grub/
    if ls /boot/grub/vmlinuz* 1>/dev/null 2>&1; then
        echo "✅ Kernel encontrado em /boot/grub/"
        KERNEL_PATH="/boot/grub/vmlinuz"
        INITRD_PATH="/boot/grub/initrd"
    else
        echo "❌ Kernel não encontrado em nenhum local!"
        ls -la /boot/
        ls -la /boot/grub/ 2>/dev/null || true
        exit 1
    fi
else
    KERNEL_PATH="/boot/vmlinuz"
    INITRD_PATH="/boot/initrd"
fi

KERNEL_FILE=$(ls \${KERNEL_PATH}* 2>/dev/null | head -1)
KERNEL_VERSION=$(basename "$KERNEL_FILE" | sed 's/vmlinuz-\?//')

if [ -z "$KERNEL_VERSION" ] || [ "$KERNEL_VERSION" = "vmlinuz" ]; then
    KERNEL_VERSION=$(uname -r)
fi

echo "✅ Kernel encontrado: $KERNEL_VERSION"
echo "📂 Kernel path: $KERNEL_PATH"
echo "📂 Initrd path: $INITRD_PATH"

echo "📦 Instalando GRUB UEFI..."
apt-get update
apt-get install -y --reinstall grub-efi-amd64 grub-efi-amd64-bin efibootmgr os-prober

rm -rf /boot/efi/EFI/Alinix
mkdir -p /boot/grub
mkdir -p /boot/efi/EFI/Alinix

echo "⚙️  Rodando grub-install..."
grub-install --target=x86_64-efi --efi-directory=/boot/efi --bootloader-id=Alinix --recheck

echo "📝 Gerando grub.cfg..."
update-grub || true

# SEMPRE validar se há entradas menuentry válidas
HAS_MENU=0
if [ -f /boot/grub/grub.cfg ]; then
    if grep -q "^menuentry" /boot/grub/grub.cfg 2>/dev/null; then
        HAS_MENU=1
        echo "✅ grub.cfg com entradas válidas encontrado"
    fi
fi

# Se não tiver menuentry, criar manualmente
if [ "\$HAS_MENU" -eq 0 ]; then
    echo "⚠️  grub.cfg sem entradas de boot, criando manualmente..."
    
    ROOT_UUID=\$(blkid -s UUID -o value "\$ROOT_DEVICE")
    
    cat > /boot/grub/grub.cfg << 'GRUBEOF'
# GRUB Configuration - Alinix
set timeout=5
set default=0

# Load modules
insmod part_gpt
insmod ext2
insmod fat
insmod search_fs_uuid

# Menu entries
menuentry "Alinix" {
    search --no-floppy --fs-uuid --set=root ROOT_UUID_PLACEHOLDER
    linux KERNEL_PATH_PLACEHOLDER root=UUID=ROOT_UUID_PLACEHOLDER ro quiet splash components fsck.mode=skip
    initrd INITRD_PATH_PLACEHOLDER
}

menuentry "Alinix (Modo de Recuperação)" {
    search --no-floppy --fs-uuid --set=root ROOT_UUID_PLACEHOLDER
    linux KERNEL_PATH_PLACEHOLDER root=UUID=ROOT_UUID_PLACEHOLDER ro single
    initrd INITRD_PATH_PLACEHOLDER
}

menuentry "UEFI Firmware Settings" {
    fwsetup
}
GRUBEOF

    # Substituir placeholders
    sed -i "s|ROOT_UUID_PLACEHOLDER|\$ROOT_UUID|g" /boot/grub/grub.cfg
    sed -i "s|KERNEL_PATH_PLACEHOLDER|\$KERNEL_PATH|g" /boot/grub/grub.cfg
    sed -i "s|INITRD_PATH_PLACEHOLDER|\$INITRD_PATH|g" /boot/grub/grub.cfg
    
    echo "✅ grub.cfg manual criado"
    echo "   UUID: \$ROOT_UUID"
    echo "   Kernel: \$KERNEL_PATH"
    echo "   Initrd: \$INITRD_PATH"
fi

if [ ! -f /boot/efi/EFI/Alinix/grubx64.efi ]; then
    echo "❌ ERRO: GRUB EFI não instalado!"
    exit 1
fi

echo "✅ UEFI GRUB OK"
`
        ]);


        // ------ EFIBOOTMGR ------
        console.log("🔧 Configurando entradas UEFI...");

        await execCmd("chroot", [
            tmpFolder,
            "/bin/bash",
            "-c",
            `
# REMOVER entradas antigas "Alinix"
efibootmgr | grep -i "Alinix" | sed 's/Boot//' | sed 's/*//' | cut -d' ' -f1 |
while read n; do
    efibootmgr -b "\$n" -B 2>/dev/null || true
done

# adicionar entrada nova
efibootmgr -c -d ${diskDevice} -p ${efiPartNum} -L "Alinix" -l "\\\\EFI\\\\Alinix\\\\grubx64.efi"

# definir como primeira
NEW=\$(efibootmgr | grep "Alinix" | head -1 | sed 's/Boot//' | sed 's/*//' | cut -d' ' -f1)
if [ -n "\$NEW" ]; then
    efibootmgr -o \$NEW
fi

efibootmgr -v
`
        ]);

        console.log("✅ GRUB UEFI instalado e configurado!");
        return;
    }

    // ---------------------
    //     MODO BIOS
    // ---------------------

    console.log("💾 Modo BIOS detectado. Instalando GRUB BIOS...");

    await execCmd("chroot", [
        tmpFolder,
        "bash",
        "-c",
        `
set -e

ROOT_DEVICE="${rootDevice}"

echo "🔍 Verificando kernel..."
if ! ls /boot/vmlinuz* 1>/dev/null 2>&1; then
    echo "❌ Nenhum kernel encontrado em /boot!"
    echo "🔍 Procurando em outros locais..."
    
    # Procurar em /boot/grub/
    if ls /boot/grub/vmlinuz* 1>/dev/null 2>&1; then
        echo "✅ Kernel encontrado em /boot/grub/"
        KERNEL_PATH="/boot/grub/vmlinuz"
        INITRD_PATH="/boot/grub/initrd"
    else
        echo "❌ Kernel não encontrado em nenhum local!"
        ls -la /boot/
        ls -la /boot/grub/ 2>/dev/null || true
        exit 1
    fi
else
    KERNEL_PATH="/boot/vmlinuz"
    INITRD_PATH="/boot/initrd"
fi

KERNEL_FILE=$(ls \${KERNEL_PATH}* 2>/dev/null | head -1)
KERNEL_VERSION=$(basename "$KERNEL_FILE" | sed 's/vmlinuz-\?//')

if [ -z "$KERNEL_VERSION" ] || [ "$KERNEL_VERSION" = "vmlinuz" ]; then
    KERNEL_VERSION=$(uname -r)
fi

echo "✅ Kernel encontrado: $KERNEL_VERSION"
echo "📂 Kernel path: $KERNEL_PATH"
echo "📂 Initrd path: $INITRD_PATH"

echo "📦 Instalando pacotes GRUB BIOS..."
apt-get update
apt-get install -y --reinstall grub-pc grub-pc-bin os-prober

echo "⚙️  Instalando GRUB em ${diskDevice}..."
grub-install --target=i386-pc --recheck ${diskDevice}

echo "📝 Gerando grub.cfg..."
update-grub

# Validar grub.cfg
if [ ! -f /boot/grub/grub.cfg ]; then
    echo "⚠️  grub.cfg não encontrado, criando manualmente..."
elif ! grep -q "menuentry" /boot/grub/grub.cfg; then
    echo "⚠️  grub.cfg sem entradas de boot, recriando..."
    rm -f /boot/grub/grub.cfg
else
    SIZE=\$(stat -c %s /boot/grub/grub.cfg)
    if [ "\$SIZE" -lt 100 ]; then
        echo "⚠️  grub.cfg muito pequeno, recriando..."
        rm -f /boot/grub/grub.cfg
    else
        echo "✅ grub.cfg validado com sucesso"
    fi
fi

# Criar grub.cfg manualmente se necessário
if [ ! -f /boot/grub/grub.cfg ] || ! grep -q "menuentry" /boot/grub/grub.cfg 2>/dev/null; then
    echo "🔧 Criando grub.cfg manual..."
    
    ROOT_UUID=\$(blkid -s UUID -o value "\$ROOT_DEVICE")
    
    cat > /boot/grub/grub.cfg << GRUBEOF
set timeout=5
set default=0

insmod part_msdos
insmod part_gpt
insmod ext2

menuentry "Alinix" {
    search --no-floppy --fs-uuid --set=root \$ROOT_UUID
    linux \$KERNEL_PATH root=UUID=\$ROOT_UUID ro quiet splash components fsck.mode=skip
    initrd \$INITRD_PATH
}

menuentry "Alinix (Modo de Recuperação)" {
    search --no-floppy --fs-uuid --set=root \$ROOT_UUID
    linux \$KERNEL_PATH root=UUID=\$ROOT_UUID ro single
    initrd \$INITRD_PATH
}
GRUBEOF
    
    echo "✅ grub.cfg manual criado com UUID: \$ROOT_UUID"
fi

echo "✅ GRUB BIOS instalado com sucesso"
`
    ]);

    console.log("✅ GRUB BIOS instalado e configurado!");
}