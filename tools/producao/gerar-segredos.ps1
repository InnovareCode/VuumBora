# Gera os tres segredos do vuumbora-backend NA SUA MAQUINA e copia um por vez para a area de transferencia,
# para colar direto no Easypanel. Os valores nunca passam pela conversa com a equipe nem ficam gravados em arquivo.
#
# Como rodar (PowerShell, na pasta do projeto):
#   powershell -ExecutionPolicy Bypass -File tools\producao\gerar-segredos.ps1
#
# Gerador criptografico do sistema (RandomNumberGenerator), base64:
#   AUTH_PEPPER e AUTH_JWT_SECRET: 48 bytes cada (a API exige 32 caracteres ou mais)
#   ADMIN_TOTP_ENCRYPTION_KEY: 32 bytes (a API exige exatamente 32 bytes em base64)
#
# Guarde os tres num gerenciador de senhas. ADMIN_TOTP_ENCRYPTION_KEY em especial: trocar ou perder
# depois invalida o 2FA dos administradores e a senha do SMTP salva no painel.

function New-SegredoBase64([int]$bytes) {
    $b = New-Object byte[] $bytes
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($b)
    $rng.Dispose()
    return [Convert]::ToBase64String($b)
}

$segredos = [ordered]@{
    'AUTH_PEPPER'               = New-SegredoBase64 48
    'AUTH_JWT_SECRET'           = New-SegredoBase64 48
    'ADMIN_TOTP_ENCRYPTION_KEY' = New-SegredoBase64 32
}

Write-Host ''
Write-Host 'Segredos gerados agora, so nesta janela. Cada um vai para a area de transferencia, um por vez.' -ForegroundColor Cyan
Write-Host 'No Easypanel: servico vuumbora-backend > Ambiente. Crie a variavel com o NOME mostrado e cole o valor (Ctrl+V).'
Write-Host 'Antes de passar para o proximo, salve o valor tambem no seu gerenciador de senhas.'
Write-Host ''

foreach ($nome in $segredos.Keys) {
    Set-Clipboard -Value $segredos[$nome]
    Write-Host ("Copiado: {0}" -f $nome) -ForegroundColor Green
    Write-Host '  Cole no Easypanel e no gerenciador de senhas, depois aperte Enter para o proximo.'
    [void](Read-Host)
}

Set-Clipboard -Value ' '
Write-Host 'Pronto. A area de transferencia foi limpa. Pode fechar esta janela.' -ForegroundColor Cyan
