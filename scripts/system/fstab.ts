import { toDev } from "../../modules/disk/replace.ts";
import { execCmd } from "./exec.ts";
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";

export async function genFstab() {
    console.log("Gerando fstab...");
    const fstabPath = path.join(tmpFolder, "etc/fstab");

    // Garantir que o diretório /etc exista
    Deno.mkdirSync(path.dirname(fstabPath), { recursive: true });

    try {
        await execCmd("bash", [
            "-c",
            `rm -f ${fstabPath} && genfstab -U ${tmpFolder} >> ${fstabPath}`
        ]);
        console.log("fstab gerado com genfstab");
    } catch {
        console.warn("[ ! ] genfstab falhou. Tentando método blkid alternativo...");

        await execCmd("bash", ["-c", `
            # Limpa o fstab em caso de falha anterior
            rm -f ${fstabPath}
            
            blkid | while read -r line; do
                dev=$(echo "$line" | cut -d: -f1)
                uuid=$(echo "$line" | grep -o 'UUID="[^"]*"' | cut -d'"' -f2)
                type=$(echo "$line" | grep -o 'TYPE="[^"]*"' | cut -d'"' -f2)
                mountpoint=$(findmnt -no TARGET "$dev" 2>/dev/null || echo "")
                
                if [[ -n "$mountpoint" && "$mountpoint" == "${tmpFolder}"* ]]; then
                    guest_mountpoint=$(echo "$mountpoint" | sed "s|^${tmpFolder}||")
                    [ -z "$guest_mountpoint" ] && guest_mountpoint="/"
                    if [[ -n "$uuid" && -n "$type" && -n "$guest_mountpoint" ]]; {
                        # Adiciona cabeçalho se o arquivo estiver vazio
                        if [ ! -s ${fstabPath} ]; then
                            echo "# /etc/fstab: static file system information." > ${fstabPath}
                            echo "# <file system> <mount point> <type> <options> <dump> <pass>" >> ${fstabPath}
                        fi
                        
                        # Define opções com base no ponto de montagem
                        if [ "$guest_mountpoint" == "/" ]; then
                            echo "UUID=$uuid $guest_mountpoint $type defaults 0 1" >> ${fstabPath}
                        elif [ "$guest_mountpoint" == "/boot/efi" ]; then
                             echo "UUID=$uuid $guest_mountpoint vfat defaults 0 2" >> ${fstabPath}
                        else
                             echo "UUID=$uuid $guest_mountpoint $type defaults 0 2" >> ${fstabPath}
                        fi
                    }
                    fi
                fi
            done
        `]);
        console.log("✅ fstab gerado com blkid alternativo");
    }

    try {
        const fstabContent = await Deno.readTextFile(fstabPath);
        if (!fstabContent.includes("UUID=") || !fstabContent.includes(" / ")) {
            console.warn("⚠️  fstab parece incompleto ou vazio, recriando com método básico...");
            await createBasicFstab(fstabPath);
        }
    } catch (e) {
        console.warn("⚠️  Erro ao verificar fstab, criando básico:", (e as Error).message);
        await createBasicFstab(fstabPath);
    }
}

/**
 * Fallback final: Cria um fstab básico apenas com Raiz e EFI.
 * Esta é a correção principal.
 */
async function createBasicFstab(fstabPath: string) {
    console.log("⚠️  Recriando fstab básico (Raiz + EFI)...");

    // Começa com o cabeçalho
    let fstabContent = `# /etc/fstab: static file system information.
#
# <file system> <mount point> <type> <options> <dump> <pass>
`;

    // 1. Obter partição Raiz
    try {
        const rootPartition = disks.flatMap(d => d.children)
            .find(p => p.mountPoint === "/")?.name;

        if (rootPartition) {
            const rootDevice = toDev(rootPartition);
            const stdout = await execCmd('blkid', ['-s', 'UUID', '-o', 'value', rootDevice]);
            const rootUuid = stdout.trim();
            // Adiciona a linha da raiz
            fstabContent += `UUID=${rootUuid} / ext4 defaults 0 1\n`;
            console.log("✅ Adicionada partição Raiz (/) ao fstab básico.");
        } else {
            console.error("❌ Não foi possível encontrar a partição raiz para o fstab básico.");
            throw new Error("Partição raiz não encontrada.");
        }
    } catch (e) {
        console.error("❌ Erro ao obter UUID da raiz:", (e as Error).message);
        throw e; // Lança erro, sem raiz o sistema não bota
    }

    // 2. Obter partição EFI (se existir)
    try {
        const efiPartition = disks.flatMap(d => d.children)
            .find(p => p.mountPoint === "/boot/efi")?.name;

        if (efiPartition) {
            const efiDevice = toDev(efiPartition);
            const stdout = await execCmd('blkid', ['-s', 'UUID', '-o', 'value', efiDevice]);
            const efiUuid = stdout.trim();
            // Adiciona a linha EFI. <dump> = 0, <pass> = 2
            fstabContent += `UUID=${efiUuid} /boot/efi vfat defaults 0 2\n`;
            console.log("✅ Adicionada partição EFI (/boot/efi) ao fstab básico.");
        } else {
            console.log("ℹ️  Nenhuma partição EFI (/boot/efi) definida, pulando (OK para BIOS).");
        }
    } catch (e) {
        console.error("⚠️  Erro ao obter UUID da partição EFI:", (e as Error).message);
        // Não lançar erro aqui, pode ser uma instalação BIOS.
    }

    // 3. Escrever o arquivo final
    try {
        await Deno.writeTextFile(fstabPath, fstabContent);
        console.log("✅ fstab básico (Raiz + EFI) criado com sucesso.");
    } catch (e) {
        console.error("❌ Não foi possível escrever o fstab básico:", (e as Error).message);
        throw e;
    }
}