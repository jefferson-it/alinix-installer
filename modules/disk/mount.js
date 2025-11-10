
import { Input } from "https://deno.land/x/cliffy@v0.25.5/prompt/input.ts";
import { Select } from "https://deno.land/x/cliffy@v0.25.5/prompt/select.ts";

export async function choiceMountPoint() {
    let mountPoint = null;

    const mountOptions = ['/', '/home', '/boot', '/var', '/tmp', 'outro'];

    const mountChoice = await Select.prompt({
        message: 'Escolha o ponto de montagem:',
        options: mountOptions
    });

    if (mountChoice === 'outro') {
        mountPoint = await Input.prompt({
            message: 'Digite o ponto de montagem (ex: /mnt/data):'
        });
    } else {
        mountPoint = mountChoice;
    }

    return mountPoint
}