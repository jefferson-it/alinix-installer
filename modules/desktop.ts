import { Confirm } from "https://deno.land/x/cliffy@v0.25.5/prompt/confirm.ts";
import { Select } from "https://deno.land/x/cliffy@v0.25.5/prompt/select.ts";

export async function choiceDesktop() {
    const confirmed = await Confirm.prompt("Deseja baixar um ambiente gráfico?");

    if (!confirmed) return;

    desktop = await Select.prompt({
        message: "Escolha o ambiente gráfico",
        options: [
            {
                value: 'gnome',
                name: 'Gnome Shell'
            },
            {
                value: 'cinnamon',
                name: 'Cinnamon'
            },
            {
                value: 'kde',
                name: 'KDE'
            },
            {
                value: 'xfce',
                name: 'xFCE'
            },
        ]
    }) as 'gnome' | 'cinnamon' | 'kde' | 'xfce' | null;
}