import { toDev } from "../../modules/disk/replace.ts";
import { isUEFI } from "../disk/verify.ts";
import { execCmd } from "./exec.ts";
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";

export async function writeGrub() {
    const rootPartition = disks.flatMap(d => d.children)
        .find(p => p.mountPoint === "/")?.name;
    if (!rootPartition) throw new Error("Nenhuma partição raiz ('/') encontrada.");

    const rootDevice = toDev(rootPartition);
    const diskDevice = rootDevice.replace(/(p?\d+)$/, '');

    console.log(` Disco detectado: ${diskDevice}`);
    console.log(` Partição raiz: ${rootDevice}`);

    const grubDefaultPath = path.join(tmpFolder, "etc/default/grub");
    try {
        await Deno.stat(grubDefaultPath);
    } catch {
        console.log("⚠️  Criando /etc/default/grub...");
        const grubConfig = `GRUB_DEFAULT=0
GRUB_TIMEOUT=5
GRUB_DISTRIBUTOR="Alinix"
GRUB_CMDLINE_LINUX_DEFAULT="quiet splash components ip=dhcp fsck.mode=skip"
GRUB_CMDLINE_LINUX=""
GRUB_TERMINAL=console
GRUB_DISABLE_OS_PROBER=false
`;
        await Deno.writeTextFile(grubDefaultPath, grubConfig);
    }

    if (await isUEFI()) {
        console.log(" Modo UEFI detectado. Instalando GRUB para UEFI...");

        // Verificar se /boot/efi existe e está montado
        const efiPartition = disks.flatMap(d => d.children)
            .find(p => p.mountPoint === "/boot/efi");

        if (!efiPartition) {
            throw new Error("⚠️  Partição EFI não encontrada! Certifique-se de ter criado uma partição EFI.");
        }

        console.log(` Partição EFI: ${efiPartition.name}`);
        const efiDevice = toDev(efiPartition.name);

        // Extrair número da partição EFI
        const efiPartNum = efiDevice.match(/(\d+)$/)?.[1] || "1";
        console.log(` Disco: ${diskDevice}, Partição EFI: ${efiPartNum}`);

        // Verificar se está montada
        let isMounted = false;
        try {
            await execCmd("mountpoint", ["-q", path.join(tmpFolder, "boot/efi")]);
            isMounted = true;
        } catch {
            isMounted = false;
        }

        if (!isMounted) {
            console.log("⚠️  Montando partição EFI...");
            await execCmd("mkdir", ["-p", path.join(tmpFolder, "boot/efi")]);
            await execCmd("mount", [toDev(efiPartition.name), path.join(tmpFolder, "boot/efi")]);
        }

        // Instalar GRUB UEFI
        await execCmd("chroot", [
            tmpFolder,
            "bash",
            "-c",
            `
            set -e
            
            # Verificar se o kernel existe ANTES de instalar GRUB
            echo " Verificando kernel instalado..."
            if [ ! -f /boot/vmlinuz-* ]; then
                echo "❌ ERRO: Nenhum kernel encontrado em /boot!"
                echo "Conteúdo de /boot:"
                ls -la /boot/
                exit 1
            fi
            
            KERNEL_VERSION=\$(ls /boot/vmlinuz-* | head -1 | sed 's/.*vmlinuz-//')
            echo "✅ Kernel encontrado: \$KERNEL_VERSION"
            
            # Instalar pacotes do GRUB
            echo " Instalando GRUB UEFI..."
            apt-get update
            apt-get install -y --reinstall grub-efi-amd64 grub-efi-amd64-bin efibootmgr os-prober
            
            # Limpar instalações anteriores
            rm -rf /boot/efi/EFI/Alinix
            rm -rf /boot/efi/EFI/ubuntu
            
            # Criar diretórios necessários
            mkdir -p /boot/grub
            mkdir -p /boot/efi/EFI/Alinix
            
            # Instalar GRUB
            echo " Instalando GRUB no disco..."
            grub-install --target=x86_64-efi --efi-directory=/boot/efi --bootloader-id=Alinix --recheck --no-floppy
            
            # Gerar configuração do GRUB
            echo " Gerando grub.cfg..."
            update-grub
            
            # Verificar se grub.cfg foi criado e tem conteúdo
            if [ ! -f /boot/grub/grub.cfg ]; then
                echo "❌ ERRO: grub.cfg não foi gerado!"
                exit 1
            fi
            
            GRUB_SIZE=\$(stat -f %z /boot/grub/grub.cfg 2>/dev/null || stat -c %s /boot/grub/grub.cfg)
            if [ "\$GRUB_SIZE" -lt 100 ]; then
                echo "❌ ERRO: grub.cfg está vazio ou corrompido!"
                cat /boot/grub/grub.cfg
                exit 1
            fi
            
            echo "✅ grub.cfg gerado com \$GRUB_SIZE bytes"
            
            # Verificar se o EFI foi instalado
            if [ ! -f /boot/efi/EFI/Alinix/grubx64.efi ]; then
                echo "❌ ERRO: GRUB EFI não foi instalado corretamente!"
                exit 1
            fi
            
            echo "✅ GRUB UEFI instalado com sucesso"
            echo ""
            echo " Arquivos instalados:"
            ls -lh /boot/efi/EFI/Alinix/
            echo ""
            echo " Primeiras linhas do grub.cfg:"
            head -20 /boot/grub/grub.cfg
            `
        ]);

        // Verificar e adicionar entrada no UEFI
        console.log(" Configurando boot UEFI...");
        await execCmd("chroot", [
            tmpFolder,
            "bash",
            "-c",
            `
            # Remover entradas antigas do Alinix
            efibootmgr | grep -i "Alinix" | cut -d' ' -f1 | sed 's/Boot//' | sed 's/*//' | while read -r bootnum; do
                efibootmgr -b "\$bootnum" -B 2>/dev/null || true
            done
            
            # Criar nova entrada (usar número correto da partição)
            PART_NUM=${efiPartNum}
            efibootmgr -c -d ${diskDevice} -p \$PART_NUM -L "Alinix" -l "\\EFI\\Alinix\\grubx64.efi"
            
            # Definir Alinix como primeira opção de boot
            BOOT_NUM=$(efibootmgr | grep "Alinix" | cut -d' ' -f1 | sed 's/Boot//' | sed 's/*//')
            if [ -n "\$BOOT_NUM" ]; then
                efibootmgr -o \$BOOT_NUM
            fi
            
            # Listar entradas
            efibootmgr -v
            `
        ]);

        console.log("✅ GRUB UEFI instalado e configurado!");
        return;
    }

    // Modo BIOS/Legacy
    console.log(" Modo BIOS/Legacy detectado. Instalando GRUB...");

    await execCmd("chroot", [
        tmpFolder,
        "bash",
        "-c",
        `
        set -e
        
        # Verificar se o kernel existe ANTES de instalar GRUB
        echo " Verificando kernel instalado..."
        if [ ! -f /boot/vmlinuz-* ]; then
            echo "❌ ERRO: Nenhum kernel encontrado em /boot!"
            echo "Conteúdo de /boot:"
            ls -la /boot/
            exit 1
        fi
        
        KERNEL_VERSION=\$(ls /boot/vmlinuz-* | head -1 | sed 's/.*vmlinuz-//')
        echo "✅ Kernel encontrado: \$KERNEL_VERSION"
        
        # Instalar pacotes do GRUB
        echo " Instalando GRUB BIOS..."
        apt-get update
        apt-get install -y --reinstall grub-pc grub-pc-bin os-prober
        
        # Instalar GRUB no disco (não na partição)
        echo " Instalando GRUB em ${diskDevice}..."
        grub-install --target=i386-pc --recheck --no-floppy ${diskDevice}
        
        # Gerar configuração
        echo " Gerando grub.cfg..."
        update-grub
        
        # Verificar se foi instalado
        if [ ! -d /boot/grub ]; then
            echo "❌ ERRO: GRUB não foi instalado corretamente!"
            exit 1
        fi
        
        if [ ! -f /boot/grub/grub.cfg ]; then
            echo "❌ ERRO: grub.cfg não foi gerado!"
            exit 1
        fi
        
        GRUB_SIZE=\$(stat -f %z /boot/grub/grub.cfg 2>/dev/null || stat -c %s /boot/grub/grub.cfg)
        if [ "\$GRUB_SIZE" -lt 100 ]; then
            echo "❌ ERRO: grub.cfg está vazio ou corrompido!"
            cat /boot/grub/grub.cfg
            exit 1
        fi
        
        echo "✅ GRUB BIOS instalado com sucesso"
        echo "✅ grub.cfg gerado com \$GRUB_SIZE bytes"
        echo ""
        echo " Primeiras linhas do grub.cfg:"
        head -20 /boot/grub/grub.cfg
        `
    ]);

    console.log("✅ GRUB BIOS instalado e configurado!");
}