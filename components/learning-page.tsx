"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, Check, CheckCircle, PlayCircle } from "@phosphor-icons/react";
import { useMarketplace } from "@/app/providers";
import { readLocalFile } from "@/lib/content-storage";
import type { CourseLesson, CourseProgress, ProductContent } from "@/lib/types";
import { VideoPlayer } from "@/components/video-player";

export function LearningPage() {
  const { slug } = useParams<{ slug: string }>();
  const { products, orders, user, ready, supabaseConfigured, loadProductContent, loadCourseProgress, saveCourseProgress } = useMarketplace();
  const product = products.find((item) => item.slug === slug && item.kind === "course");
  const [content, setContent] = useState<ProductContent | null>(null);
  const [progress, setProgress] = useState<CourseProgress>({ completedLessonIds: [] });
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const localDirectAccess = useMemo(() => Boolean(product && orders.some((order) => !order.isRemote && order.productId === product.id && order.status === "paid_demo")), [orders, product]);

  const load = useCallback(async () => {
    if (!ready || !product) return;
    setLoading(true);
    setError(null);
    try {
      let permitted = product.creatorId === user?.id || localDirectAccess || orders.some((order) => order.isRemote && order.buyerId === user?.id && order.productId === product.id && order.productKind === "course" && order.status === "paid_demo");
      const remote = supabaseConfigured && /^[0-9a-f-]{36}$/i.test(product.id);
      if (!permitted) {
        const memberOrders = orders.filter((order) => order.status === "paid_demo" && order.productKind === "membership" && (!order.isRemote || order.buyerId === user?.id));
        for (const membershipOrder of memberOrders) {
          const membership = products.find((item) => item.id === membershipOrder.productId);
          if (!membership) continue;
          const memberContent = await loadProductContent(membership).catch(() => null);
          if (memberContent?.membershipCourseIds.includes(product.id)) { permitted = true; break; }
        }
      }
      let nextContent = await loadProductContent(product);
      if (!remote && !permitted) {
        nextContent = {
          ...nextContent,
          modules: nextContent.modules.map((module) => ({ ...module, lessons: module.lessons.filter((lesson) => lesson.isPreview) })).filter((module) => module.lessons.length),
        };
      }
      const previewOnly = !permitted && nextContent.modules.some((module) => module.lessons.some((lesson) => lesson.isPreview));
      if (!permitted && !previewOnly) throw new Error("Un achat ou un abonnement actif est nécessaire pour accéder à ce cours.");
      setContent(nextContent);
      setIsPreview(previewOnly);
      if (permitted && !previewOnly) {
        const nextProgress = await loadCourseProgress(product.id);
        setProgress({ completedLessonIds: nextProgress.completedLessonIds ?? [], lastLessonId: nextProgress.lastLessonId });
        const allLessonIds = nextContent.modules.flatMap((module) => module.lessons.map((lesson) => lesson.id));
        setActiveLessonId(nextProgress.lastLessonId && allLessonIds.includes(nextProgress.lastLessonId) ? nextProgress.lastLessonId : allLessonIds[0] ?? null);
      } else {
        setProgress({ completedLessonIds: [] });
        setActiveLessonId(nextContent.modules.flatMap((module) => module.lessons)[0]?.id ?? null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Le cours n’a pas pu être chargé.");
    } finally {
      setLoading(false);
    }
  }, [ready, product, user, orders, products, localDirectAccess, supabaseConfigured, loadProductContent, loadCourseProgress]);

  // The request resolves asynchronously and synchronizes the loaded course state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const lessons = content?.modules.flatMap((module) => module.lessons.map((lesson) => ({ lesson, moduleTitle: module.title }))) ?? [];
  const currentIndex = lessons.findIndex((item) => item.lesson.id === activeLessonId);
  const current = currentIndex >= 0 ? lessons[currentIndex].lesson : null;

  async function toggleComplete(lesson: CourseLesson) {
    if (!product || isPreview) return;
    const completedLessonIds = progress.completedLessonIds.includes(lesson.id)
      ? progress.completedLessonIds.filter((id) => id !== lesson.id)
      : [...progress.completedLessonIds, lesson.id];
    const next = { completedLessonIds, lastLessonId: lesson.id };
    setProgress(next);
    setError(null);
    try { await saveCourseProgress(product.id, next); }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : "La progression n’a pas pu être enregistrée."); }
  }

  async function selectLesson(lessonId: string) {
    setActiveLessonId(lessonId);
    if (!product || isPreview) return;
    const next = { ...progress, lastLessonId: lessonId };
    setProgress(next);
    try { await saveCourseProgress(product.id, next); }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : "La reprise du cours n’a pas pu être enregistrée."); }
  }

  async function download(resourceId: string, fileName: string, storagePath?: string) {
    if (!product) return;
    setDownloadError(null);
    if (storagePath && supabaseConfigured) {
      const anchor = document.createElement("a");
      anchor.href = `/api/resources/${encodeURIComponent(product.id)}/${encodeURIComponent(resourceId)}`;
      anchor.download = fileName;
      anchor.click();
      return;
    }
    try {
      const file = await readLocalFile(resourceId);
      if (!file) throw new Error("Le fichier n’a pas été trouvé sur cet appareil.");
      const url = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadFailure) {
      setDownloadError(downloadFailure instanceof Error ? downloadFailure.message : "Le téléchargement a échoué.");
    }
  }

  if (!ready) return <div className="page-wrap"><div className="loading-card" /></div>;
  if (!product) return <div className="page-wrap"><div className="empty-state"><h1>Cours introuvable</h1><p>Cette adresse ne correspond à aucun cours disponible.</p><Link className="button button-dark" href="/">Retour à l’accueil</Link></div></div>;
  if (loading) return <div className="page-wrap"><div className="loading-card" /></div>;

  return (
    <div className="page-wrap learning-wrap">
      <nav className="breadcrumbs" aria-label="Fil d’Ariane"><Link href={isPreview ? `/produits/${product.slug}` : "/bibliotheque"}><ArrowLeft size={14} /> {isPreview ? "Fiche du cours" : "Ma bibliothèque"}</Link><span>›</span><span>Apprentissage</span></nav>
      <header className="learning-header"><div><p className="page-eyebrow">{isPreview ? "Aperçu gratuit" : "Votre cours"} · {product.creatorName}</p><h1>{product.title}</h1><p>{product.subtitle}</p></div>{isPreview && <Link className="button button-dark" href={`/checkout/${product.slug}`}>Accéder au cours complet <ArrowRight size={16} /></Link>}</header>
      {error && <p className="form-error" role="alert">{error}</p>}
      {content && <div className="learning-layout">
        <aside className="learning-outline"><div className="learning-outline-heading"><strong>Programme</strong><span>{lessons.length} leçon{lessons.length > 1 ? "s" : ""}</span></div>{!lessons.length && <p className="content-empty">Aucune leçon n’est encore proposée en aperçu.</p>}{content.modules.map((module, moduleIndex) => <section className="learning-module" key={module.id}><h2>{moduleIndex + 1}. {module.title}</h2>{module.lessons.map((lesson, lessonIndex) => <button className={`learning-lesson${activeLessonId === lesson.id ? " is-active" : ""}`} key={lesson.id} type="button" onClick={() => void selectLesson(lesson.id)}><span className="learning-lesson-icon">{progress.completedLessonIds.includes(lesson.id) && !isPreview ? <CheckCircle size={16} weight="fill" /> : <PlayCircle size={16} />}</span><span>{lesson.title || `Leçon ${lessonIndex + 1}`}</span>{isPreview && <span className="preview-pill">Aperçu</span>}</button>)}</section>)}</aside>
        <main className="learning-main">
          {current ? <article className="learning-lesson-content"><p className="page-eyebrow">{lessons[currentIndex].moduleTitle}</p><div className="learning-main-title"><h2>{current.title}</h2>{current.durationMinutes && <span>{current.durationMinutes} min</span>}</div>
            {current.videoUrl && <VideoPlayer url={current.videoUrl} title={current.title} />}
            <div className="lesson-body">{current.description ? <p>{current.description}</p> : <p className="field-help">Aucun texte ajouté à cette leçon.</p>}</div>
            {current.resources?.length ? <section className="lesson-resources"><h3>Fichiers de la leçon</h3>{current.resources.map((resource) => <button className="resource-download" key={resource.id} type="button" onClick={() => void download(resource.id, resource.fileName, resource.storagePath)}><ArrowDown size={16} /><span>{resource.name}</span><small>Télécharger</small></button>)}</section> : null}
            {downloadError && <p className="form-error" role="alert">{downloadError}</p>}
            {isPreview ? <div className="preview-cta"><p>Cette leçon est offerte en aperçu. Achetez le cours pour suivre tous les modules et enregistrer votre progression.</p><Link className="button button-dark" href={`/checkout/${product.slug}`}>Découvrir le cours complet <ArrowRight size={16} /></Link></div> : <div className="lesson-controls"><button className={`button ${progress.completedLessonIds.includes(current.id) ? "button-light" : "button-dark"}`} type="button" onClick={() => void toggleComplete(current)}>{progress.completedLessonIds.includes(current.id) ? <CheckCircle size={17} weight="fill" /> : <Check size={17} />} {progress.completedLessonIds.includes(current.id) ? "Marquée comme terminée" : "Marquer comme terminée"}</button><div><button className="button button-light button-small" type="button" disabled={currentIndex <= 0} onClick={() => void selectLesson(lessons[currentIndex - 1]?.lesson.id ?? "")}>Précédente</button><button className="button button-dark button-small" type="button" disabled={currentIndex >= lessons.length - 1} onClick={() => void selectLesson(lessons[currentIndex + 1]?.lesson.id ?? "")}>Suivante <ArrowRight size={15} /></button></div></div>}
          </article> : <div className="content-empty"><h2>Le cours est en préparation</h2><p>Le créateur ajoutera bientôt les premières leçons.</p></div>}
          {!isPreview && <div className="learning-progress"><div><strong>Votre progression</strong><span>{progress.completedLessonIds.length} sur {lessons.length} leçon{lessons.length > 1 ? "s" : ""}</span></div><progress max={Math.max(lessons.length, 1)} value={progress.completedLessonIds.length} aria-label="Progression du cours" /></div>}
          {product.published && <p className="learning-help">Si une vidéo ne se lance pas, ouvrez la leçon plus tard ou vérifiez le lien auprès du créateur.</p>}
        </main>
      </div>}
    </div>
  );
}
