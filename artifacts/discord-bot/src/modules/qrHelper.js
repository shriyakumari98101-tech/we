import QRCode from "qrcode";
import { AttachmentBuilder } from "discord.js";

export async function generateQrAttachment(token) {
  const buffer = await QRCode.toBuffer(token, {
    type: "png",
    width: 300,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });
  return new AttachmentBuilder(buffer, { name: "qr-login.png" });
}
