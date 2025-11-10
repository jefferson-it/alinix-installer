import { Select } from "https://deno.land/x/cliffy@v0.25.5/prompt/select.ts";
import AdvancedDisk, { renumberPartitions } from './disk/advanced.js';
import { Confirm } from "https://deno.land/x/cliffy@v0.25.5/prompt/confirm.ts";
import { Number } from "https://deno.land/x/cliffy@v0.25.5/prompt/number.ts";

// Função que lista discos via lsblk
export async function listDisks() {
    const cmd = new Deno.Command("lsblk", { args: ["-J", '-b', "-o", "NAME,SIZE,TYPE"] });
    const { stdout } = await cmd.output();
    const { blockdevices } = JSON.parse(new TextDecoder().decode(stdout));
    return blockdevices.filter(d => d.type === "disk").map(d => ({
        ...d,
        name: `/dev/${d.name}`.replace("/dev//dev/", '/dev/'),
        size: (d.size / 1_000_000_000).toFixed(2), // GB para display
        bytes: d.size, // Tamanho real em bytes
        type: d.type,
    }));
}

// Menu principal
export default async function ChoiceDisk() {
    const choice = await Select.prompt({
        message: "Escolha o tipo de instalação",
        options: [
            { name: "Usar disco inteiro", value: "entire" },
            { name: "Avançado (particionamento manual)", value: "advanced" }
        ]
    });

    switch (choice) {
        case "entire":
            await entireDiskMenu();
            break;
        case "advanced":
            await AdvancedDisk()
            break;
    }
}

async function entireDiskMenu() {
    const disks = await listDisks();
    const options = disks.map(d => ({
        name: `${d.name} (${d.size} GB)`,
        value: d.name
    }));

    options.push({ name: "⬅ Voltar", value: "back" });

    const disk = await Select.prompt({
        message: "Selecione o disco para instalar",
        options
    });

    if (disk === "back") {
        return;
    }

    console.log(`💾 Disco selecionado: ${disk}`);
    const confirm = await Confirm.prompt({
        message: "O disco será apagado por completo, deseja continuar?",
    });

    if (!confirm) return await entireDiskMenu();

    console.log(`🚀 Disco ${disk} selecionado`);

    const diskObject = disks.find(v => v.name === disk);
    diskObject.children = []; // Limpa partições existentes

    // --- LÓGICA DE PARTICIONAMENTO CORRIGIDA ---

    // Definir constantes em bytes (potência de 1024)
    const GIB_IN_BYTES = 1024 * 1024 * 1024;
    const bootSizeInBytes = 1 * GIB_IN_BYTES; // 1 GiB

    // 1. Adicionar partição de Boot/EFI PRIMEIRO
    const uefi = await isUEFI();
    diskObject.children.push({
        mountPoint: uefi ? '/boot/efi' : '/boot',
        fileSystem: uefi ? 'fat32' : 'ext4',
        size: bootSizeInBytes, // Tamanho fixo
        erase: true,
        name: ''
    });

    // 2. Adicionar partição /home (Opcional)
    const wishHomePartition = await Confirm.prompt("Deseja reservar uma partição para /home?");

    if (wishHomePartition) {
        // Converta bytes para GB (potência de 1000) apenas para exibição
        const diskSizeGB = diskObject.bytes / 1_000_000_000;
        const bootSizeGB = bootSizeInBytes / 1_000_000_000;

        // Reservar pelo menos 2 GiB para a raiz (arbitrário, ajuste conforme necessário)
        const maxHomeGB = diskSizeGB - bootSizeGB - 2;

        const homeSizeInGB = await Number.prompt({
            message: `Quanto GB deseja para a partição /home? (${diskSizeGB.toFixed(2)} GB disponíveis)`,
            max: maxHomeGB,
            min: 1
        });

        // **CORREÇÃO:** Converter a entrada (assumida como GB) para Bytes usando o multiplicador GiB
        const homeSizeInBytes = homeSizeInGB * GIB_IN_BYTES;

        diskObject.children.push({
            mountPoint: '/home',
            fileSystem: 'ext4',
            size: homeSizeInBytes, // Tamanho fixo
            erase: true,
            name: ''
        });
    }

    // 3. Adicionar partição Raiz (/) POR ÚLTIMO
    // Ela pegará todo o espaço restante.
    diskObject.children.push({
        mountPoint: '/',
        fileSystem: 'ext4',
        size: "100%", // **CORREÇÃO:** Usar "100%" para pegar o resto
        erase: true,
        name: ''
    });

    // -------------------------------------------------

    // Renumerar partições agora que todas foram adicionadas
    diskObject.children = renumberPartitions(diskObject.children, diskObject.name);

    globalThis.disks = [{
        ...diskObject,
        wipe: true,
        useAll: true
    }];

    console.log('✅ Particionamento configurado:', diskObject.children);
}
export async function isUEFI() {
    try {
        const cmd = new Deno.Command("test", {
            args: ["-d", "/sys/firmware/efi"],
        });
        const { code } = await cmd.output();
        return code === 0;
    } catch {
        return false;
    }
}