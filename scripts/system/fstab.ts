import { execCmd } from "./exec.ts";
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";

export async function genFstab() {
    console.log("Gerando fstab...");
    const fstabPath = path.join(tmpFolder, "etc/fstab");

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
                    
                    if [[ -n "$uuid" && -n "$type" && -n "$guest_mountpoint" ]]; then
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
                    fi
                fi
            done
        `]);
        console.log("✅ fstab gerado com blkid alternativo");
    }

    try {
        const fstabContent = await Deno.readTextFile(fstabPath);
        if (!fstabContent.includes("UUID=") || !fstabContent.trim().match(/UUID=.*\s+\/\s+/)) {
            console.warn("⚠️  fstab parece incompleto ou vazio, recriando com método básico...");
            await createBasicFstab(fstabPath);
        }
    } catch (e) {
        console.warn("⚠️  Erro ao verificar fstab, criando básico:", (e as Error).message);
        await createBasicFstab(fstabPath);
    }
}

/**
 * Fallback final: Cria um fstab básico identificando dinamicamente
 * todos os pontos de montagem atualmente montados em tmpFolder
 */
async function createBasicFstab(fstabPath: string) {
    console.log("⚠️  Recriando fstab básico (detectando pontos de montagem)...");

    let fstabContent = `# /etc/fstab: static file system information.
#
# <file system> <mount point> <type> <options> <dump> <pass>
`;

    try {
        // 1. Obter todos os pontos de montagem sob tmpFolder usando findmnt
        const findmntOutput = await execCmd("findmnt", [
            "-rno", "TARGET,SOURCE,FSTYPE",
            "-R", tmpFolder
        ]);

        const mounts = findmntOutput.trim().split("\n")
            .map(line => {
                const [target, source, fstype] = line.trim().split(/\s+/);
                return { target, source, fstype };
            })
            .filter(m => m.target && m.source && m.fstype);

        if (mounts.length === 0) {
            throw new Error("Nenhum ponto de montagem encontrado");
        }

        // 2. Processar cada montagem e obter UUID
        const entries: Array<{ mountPoint: string, uuid: string, type: string, pass: number }> = [];

        for (const mount of mounts) {
            // Converter o ponto de montagem para o formato guest (remover tmpFolder)
            let guestMountPoint = mount.target.replace(tmpFolder, "");
            if (!guestMountPoint || guestMountPoint === "") {
                guestMountPoint = "/";
            }

            // Obter UUID do dispositivo
            let uuid: string;
            try {
                uuid = (await execCmd("blkid", ["-s", "UUID", "-o", "value", mount.source])).trim();
            } catch {
                console.warn(`⚠️  Não foi possível obter UUID para ${mount.source}, pulando...`);
                continue;
            }

            if (!uuid) {
                console.warn(`⚠️  UUID vazio para ${mount.source}, pulando...`);
                continue;
            }

            // Determinar tipo do filesystem
            let fsType = mount.fstype;
            if (guestMountPoint === "/boot/efi" || fsType === "vfat") {
                fsType = "vfat";
            }

            // Determinar o valor de pass (fsck order)
            const pass = guestMountPoint === "/" ? 1 : 2;

            entries.push({
                mountPoint: guestMountPoint,
                uuid: uuid,
                type: fsType,
                pass: pass
            });
        }

        // 3. Verificar se encontrou a raiz
        const hasRoot = entries.some(e => e.mountPoint === "/");
        if (!hasRoot) {
            throw new Error("Partição raiz (/) não encontrada nos pontos de montagem");
        }

        // 4. Ordenar: raiz primeiro, depois os outros em ordem alfabética
        entries.sort((a, b) => {
            if (a.mountPoint === "/") return -1;
            if (b.mountPoint === "/") return 1;
            return a.mountPoint.localeCompare(b.mountPoint);
        });

        // 5. Gerar as entradas do fstab
        for (const entry of entries) {
            fstabContent += `UUID=${entry.uuid} ${entry.mountPoint} ${entry.type} defaults 0 ${entry.pass}\n`;
            console.log(`✅ Adicionada partição ${entry.mountPoint} (${entry.type}) ao fstab`);
        }

        // 6. Escrever o arquivo
        await Deno.writeTextFile(fstabPath, fstabContent);
        console.log("✅ fstab básico criado com sucesso.");

    } catch (e) {
        console.error("❌ Erro ao criar fstab básico:", (e as Error).message);
        throw e;
    }
}