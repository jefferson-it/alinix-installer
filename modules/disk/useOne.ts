import { Confirm } from "https://deno.land/x/cliffy@v0.25.5/prompt/confirm.ts";
import { Number } from "https://deno.land/x/cliffy@v0.25.5/prompt/number.ts";
import { Select } from "https://deno.land/x/cliffy@v0.25.5/prompt/select.ts";
import { listDisks } from "./list.ts";
import { renumberPartitions } from "./replace.ts";
import { isUEFI } from "../../scripts/disk/verify.ts";

export async function entireDiskMenu() {
    const disksLocal = await listDisks();
    const options = disksLocal.map(d => ({
        name: `${d.name} (${d.size} GB)`,
        value: d.name
    }));

    options.push({ name: "⬅ Voltar", value: "back" });

    const disk = await Select.prompt({
        message: "Selecione o disco para instalar",
        options
    });

    if (disk === "back") return await entireDiskMenu();


    console.log(`Disco selecionado: ${disk}`);
    const confirm = await Confirm.prompt({
        message: "O disco será apagado por completo, deseja continuar?",
    });

    if (!confirm) return await entireDiskMenu();

    console.log(`Disco ${disk} selecionado`);

    const diskObject = disksLocal.find(v => v.name === disk);

    if (!diskObject) return await entireDiskMenu();


    diskObject.children = [];

    const GIB_IN_BYTES = 1024 * 1024 * 1024;

    const uefi = await isUEFI();
    const bootSizeInBytes = uefi ? 1 * GIB_IN_BYTES : 0;

    if (uefi) diskObject.children.push({
        mountPoint: '/boot/efi',
        fileSystem: 'fat32',
        size: bootSizeInBytes,
        erase: true,
        use: true,
        name: '',
    });

    const wishHomePartition = await Confirm.prompt("Deseja reservar uma partição para /home?");

    if (wishHomePartition) {
        const diskSizeGB = diskObject.bytes / (1024 ** 3);
        const bootSizeGB = bootSizeInBytes / (1024 ** 3);

        const maxHomeGB = diskSizeGB - bootSizeGB - 2;

        const homeSizeInGB = await Number.prompt({
            message: `Quanto GB deseja para a partição /home? (${diskSizeGB.toFixed(2)} GB disponíveis)`,
            max: maxHomeGB,
            min: 1
        });

        const homeSizeInBytes = homeSizeInGB * GIB_IN_BYTES;

        diskObject.children.push({
            mountPoint: '/home',
            fileSystem: 'ext4',
            size: homeSizeInBytes,
            erase: true,
            use: true,
            name: ''
        });
    }

    diskObject.children.push({
        mountPoint: '/',
        fileSystem: 'ext4',
        size: "100%",
        erase: true,
        use: true,
        name: ''
    });

    diskObject.children = renumberPartitions(diskObject.children, diskObject.name);

    disks = [{
        ...diskObject,
        wipe: true,
    }];

    console.log('[ OK ] Particionamento configurado:', diskObject.children);
}
