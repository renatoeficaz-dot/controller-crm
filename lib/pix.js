// Gera o Pix "Copia e Cola" (BR Code, padrão EMV do Banco Central) sem
// depender de nenhuma API de banco — só precisa da chave Pix cadastrada em
// Configurações. Cada campo aqui é um TLV (tag-length-value) de 2 dígitos.
//
// Referência: manual "BR Code" do Banco Central (EMVCo Merchant-Presented QR).

function tlv(id, valor) {
  const v = String(valor);
  return id + String(v.length).padStart(2, "0") + v;
}

// Some acento/caractere fora do padrão ASCII básico exigido pelo campo — Pix
// não aceita "ã", "ç" etc. nesses campos específicos (nome/cidade).
function soAscii(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // marcas de acento combinantes (a-til vira "a" solto)
    .replace(/[^\x20-\x7E]/g, "") // qualquer coisa fora do ASCII imprimivel
    .toUpperCase();
}

// CRC16-CCITT (polinômio 0x1021, inicial 0xFFFF) — exigido no fim do payload.
function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// valor: número em R$ ou null (Pix sem valor fixo — quem paga digita).
// txid: identificador da cobrança, até 25 caracteres alfanuméricos, "***" se
// não tiver nenhum (o padrão exige o campo, mesmo vazio).
export function gerarPixCopiaECola({ chave, nome, cidade, valor, txid }) {
  if (!chave) throw new Error("Chave Pix não configurada.");

  const merchantAccount = tlv("00", "br.gov.bcb.pix") + tlv("01", chave.trim());
  const nomeOk = soAscii(nome).slice(0, 25) || "RECEBEDOR";
  const cidadeOk = soAscii(cidade).slice(0, 15) || "BRASIL";
  const txidOk = (String(txid || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 25) || "***");

  const partes = [
    tlv("00", "01"), // Payload Format Indicator
    tlv("26", merchantAccount), // Merchant Account Info (Pix)
    tlv("52", "0000"), // Merchant Category Code
    tlv("53", "986"), // Moeda: BRL
    valor != null ? tlv("54", Number(valor).toFixed(2)) : "",
    tlv("58", "BR"),
    tlv("59", nomeOk),
    tlv("60", cidadeOk),
    tlv("62", tlv("05", txidOk)),
  ].join("");

  const semCrc = partes + "6304";
  return semCrc + crc16(semCrc);
}

// Data URI (PNG base64) do QR Code pronto pra <img src="...">.
export async function gerarPixQrCodeDataUrl(payload) {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: 300 });
}
