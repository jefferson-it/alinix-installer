import { Select } from "https://deno.land/x/cliffy@v0.25.5/prompt/select.ts";
import AdvancedDisk from "./disk/advanced.ts";
import { entireDiskMenu } from "./disk/useOne.ts";

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

