import { seedCreators, seedProducts } from "@/lib/seed";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function readableSlug(slug: string) {
  const words = slug.replace(/-[a-z0-9]{4,5}$/i, "").split("-").filter(Boolean);
  return words.map((word) => `${word.slice(0, 1).toLocaleUpperCase("fr-FR")}${word.slice(1)}`).join(" ") || "Création indépendante";
}

export async function getProductMetadata(slug: string) {
  const seeded = seedProducts.find((product) => product.slug === slug);
  if (seeded) return { title: `${seeded.title} · ${seeded.creatorName}`, description: seeded.description };

  const supabase = await getSupabaseServerClient();
  if (supabase) {
    const { data } = await supabase.from("products").select("title, description, creator_name").eq("slug", slug).eq("published", true).maybeSingle();
    if (data) return { title: `${data.title} · ${data.creator_name}`, description: data.description || `Découvrez ${data.title}, créé par ${data.creator_name}.` };
  }
  return { title: `${readableSlug(slug)} · Création indépendante`, description: "Découvrez cette création indépendante." };
}

export async function getCreatorMetadata(slug: string) {
  const seeded = seedCreators.find((creator) => creator.slug === slug);
  if (seeded) return { title: `${seeded.name} · Boutique créateur`, description: seeded.bio };

  const supabase = await getSupabaseServerClient();
  if (supabase) {
    const { data } = await supabase.from("creators").select("name, bio").eq("slug", slug).maybeSingle();
    if (data) return { title: `${data.name} · Boutique créateur`, description: data.bio || `Découvrez les créations de ${data.name}.` };
  }
  return { title: `${readableSlug(slug)} · Boutique créateur`, description: "Découvrez les créations de cette personne indépendante." };
}
