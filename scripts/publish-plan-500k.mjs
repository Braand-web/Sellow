import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createGuideDescription, guidePlainText, guideSellerEmail, guideSlug } from "../lib/plan-500k-product.mjs";

// Operational script only. All credentials stay in the server environment.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || key === "[SENSITIVE]") throw new Error("Configurez les identifiants serveur Supabase pour publier le guide.");
if (new URL(url).hostname !== "phcsrjmnlecrwfduailm.supabase.co") throw new Error("Ce script est réservé au projet Supabase Sellow.");
const admin = createClient(url, key, { auth: { persistSession:false, autoRefreshToken:false } });

async function must(result, message) {
  if (result.error) throw new Error(`${message} (${result.error.code ?? result.error.statusCode ?? "erreur"})`);
  return result.data;
}
let seller;
for (let page = 1; !seller; page++) {
  const users = await must(await admin.auth.admin.listUsers({ page, perPage:100 }), "Le compte vendeur n’a pas pu être recherché");
  seller = users.users.find((user) => user.email?.toLowerCase() === guideSellerEmail);
  if (!seller && users.users.length < 100) throw new Error("Le compte vendeur est introuvable. Aucun compte de remplacement n’a été créé.");
}
const creator = await must(await admin.from("creators").select("id, name, slug").eq("id", seller.id).maybeSingle(), "Le profil vendeur n’a pas pu être chargé");
if (!creator) throw new Error("Le vendeur existe, mais son profil créateur doit être complété avant la publication.");
await must(await admin.from("product_files").select("id").limit(1), "La migration des fichiers doit être appliquée avant la publication");
await must(await admin.from("products").select("compare_at_amount, save_for_later_enabled").limit(1), "La migration des options de vente doit être appliquée");
const existing = await must(await admin.from("products").select("id, creator_id, published").eq("slug", guideSlug).maybeSingle(), "Le produit existant n’a pas pu être vérifié");
if (existing && existing.creator_id !== seller.id) throw new Error("Cette adresse de produit appartient déjà à un autre vendeur.");
const id = existing?.id ?? randomUUID();
const assetDirectory = resolve(process.env.SELLOW_GUIDE_ASSET_DIR ?? "private-import/plan-500k-afrique");
const coverPath = resolve(process.env.SELLOW_GUIDE_COVER ?? "private-import/plan-500k-afrique/couverture.png");
const pdfPath = resolve(process.env.SELLOW_GUIDE_PDF ?? "private-import/plan-500k-afrique/Le_Plan_500K_Afrique.pdf");
// Read all local assets before creating or altering a product.
const cover = await readFile(coverPath);
const pdf = await readFile(pdfPath);
const assets = await Promise.all(["guide-en-bref.webp", "apercu-sommaire.webp", "apercu-plan-90-jours.webp"].map(async (name) => ({ name, bytes:await readFile(resolve(assetDirectory,name)) })));
const images = {};
async function publicImage(name, bytes, contentType) {
  const path = `${seller.id}/${id}/plan-500k/${name}`;
  await must(await admin.storage.from("product-rich-images").upload(path, bytes, { upsert:true, contentType }), "Une image publique n’a pas pu être téléversée");
  return admin.storage.from("product-rich-images").getPublicUrl(path).data.publicUrl;
}
const coverUrl = await publicImage("couverture.png", cover, "image/png");
for (const [index, asset] of assets.entries()) images[["overview","contents","roadmap"][index]] = await publicImage(asset.name, asset.bytes, "image/webp");
const descriptionContent = createGuideDescription(images);
const row = {
  id, creator_id:seller.id, creator_name:creator.name, creator_slug:creator.slug, slug:guideSlug,
  title:"Le Plan 500K Afrique", subtitle:"Créez et monétisez votre SaaS ou site web en Afrique francophone, avec un plan concret sur 90 jours.",
  product_kind:"download", category:"Entrepreneuriat", tags:["Afrique", "SaaS", "entrepreneuriat", "Coden", "WhatsApp"],
  description:guidePlainText(descriptionContent), description_content:descriptionContent,
  amount:500000, compare_at_amount:2500000, currency:"XAF", save_for_later_enabled:true,
  cover:coverUrl, cover_label:"LE PLAN 500K\nAFRIQUE", details:{}, published:existing?.published ?? false,
};
await must(await admin.from("products").upsert(row,{onConflict:"id"}), "La fiche produit n’a pas pu être enregistrée");
const oldFiles = await must(await admin.from("product_files").select("*").eq("product_id",id).order("position"), "Les fichiers existants n’ont pas pu être vérifiés");
const existingPdf = oldFiles.find((file) => file.file_name === "Le_Plan_500K_Afrique.pdf");
const fileId = existingPdf?.id ?? randomUUID();
const storagePath = existingPdf?.storage_path ?? `${seller.id}/${id}/files/${fileId}/Le_Plan_500K_Afrique.pdf`;
if (!existingPdf) await must(await admin.storage.from("product-files").upload(storagePath,pdf,{contentType:"application/pdf",upsert:false}), "Le PDF privé n’a pas pu être téléversé");
const manifest = existingPdf ? oldFiles : [...oldFiles, {id:fileId,name:"Le Plan 500K Afrique — guide PDF et bonus",file_name:"Le_Plan_500K_Afrique.pdf",storage_path:storagePath,size_bytes:pdf.length,mime_type:"application/pdf",position:oldFiles.length}];
await must(await admin.rpc("replace_product_files", {p_product_id:id,p_creator_id:seller.id,p_files:manifest}), "Le PDF n’a pas pu être associé au produit");
await must(await admin.from("products").update({published:true}).eq("id",id).eq("creator_id",seller.id), "Le produit n’a pas pu être publié");
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {auth:{persistSession:false}});
const publicProduct = await must(await anon.from("products").select("id, slug, amount, compare_at_amount, currency, published").eq("id",id).single(), "La publication publique n’a pas pu être vérifiée");
const publicFiles = await anon.from("product_files").select("id").eq("product_id",id);
if (!publicFiles.error && publicFiles.data?.length) throw new Error("Les fichiers privés sont visibles sans compte; vérifiez les droits avant de poursuivre.");
const unsigned = await fetch(`${url}/storage/v1/object/product-files/${storagePath}`);
if (unsigned.ok) throw new Error("Le PDF est accessible sans autorisation; vérifiez le bucket privé.");
if (publicProduct.amount !== 500000 || publicProduct.compare_at_amount !== 2500000 || publicProduct.currency !== "XAF") throw new Error("Les prix publiés ne correspondent pas au produit demandé.");
console.log(JSON.stringify({published:true,productId:id,url:`https://sellow.fun/produits/${guideSlug}`,privatePdf:true,files:manifest.length}));
