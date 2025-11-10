export function mbToGb(mb, decimals = 2) {
    if (isNaN(mb)) throw new Error("O valor informado não é um número válido (MB).");
    return +(mb / 1024).toFixed(decimals);
}

export function gbToMb(gb, decimals = 0) {
    if (isNaN(gb)) throw new Error("O valor informado não é um número válido (GB).");
    return +(gb * 1024).toFixed(decimals);
}

export function mbToBytes(mb) {
    if (isNaN(mb)) throw new Error("O valor informado não é um número válido (MB).");
    return Math.round(mb * 1024 * 1024);
}

export function bytesToMb(bytes, decimals = 2) {
    if (isNaN(bytes)) throw new Error("O valor informado não é um número válido (bytes).");
    return +(bytes / (1024 * 1024)).toFixed(decimals);
}
