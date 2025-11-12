import { Select } from "https://deno.land/x/cliffy@v0.25.5/prompt/select.ts";
import { isUEFI } from "../../scripts/disk/verify.ts";
import { disk } from "../../index.d.ts";

export async function selectFileSystem(): Promise<"ext4" | "fat32" | "ntfs" | "efi" | "bios" | 'vfat' | 'ext3' | 'ext2' | 'swap'> {
    const fileSystemOptions = ['ext4', 'fat32', 'ntfs'];

    if (await isUEFI()) {
        fileSystemOptions.push('efi');
    } else {
        fileSystemOptions.push('bios');
    }

    const fileSystem = await Select.prompt({
        message: 'Escolha o tipo de sistema de arquivos:',
        options: fileSystemOptions
    });

    return fileSystem as disk['children'][number]['fileSystem']
}

