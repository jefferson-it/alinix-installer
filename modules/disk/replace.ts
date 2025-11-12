import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { disk } from "../../index.d.ts";

export function toDev(d: string) {
    return d.startsWith('/dev') ? d : path.join('/dev', d)
}

export function renumberPartitions(partitions: disk['children'], diskName: string | disk) {
    // Garantir que diskName é uma string
    const diskNameStr = typeof diskName === 'string' ? diskName : diskName.name || diskName;

    return partitions.map((part, index) => {
        const separator = (diskNameStr as string).match(/nvme|mmcblk|loop/) ? 'p' : '';
        const newName = `${diskNameStr}${separator}${index + 1}`;
        return {
            ...part,
            name: newName
        };
    });
}
