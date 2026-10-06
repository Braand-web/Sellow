"use client";

import { ArrowDown, ArrowUp, Plus, Trash } from "@phosphor-icons/react";
import type { CourseLesson, MembershipPost, Product, ProductContent } from "@/lib/types";
import { RichTextEditor } from "@/components/rich-text-editor";
import { documentFromPlainText, richTextToPlainText } from "@/lib/rich-text";

type Props = {
  kind: Product["kind"];
  value: ProductContent;
  files?: Record<string, File>;
  products: Product[];
  creatorId: string;
  productId?: string;
  localContent?: boolean;
  onChange: (content: ProductContent) => void;
  onFilesChange: (files: Record<string, File>) => void;
};

export function ProductContentEditor({ kind, value, products, creatorId, productId, localContent = true, files: incomingFiles = {}, onChange, onFilesChange }: Props) {
  const files = incomingFiles;

  function changeFiles(next: Record<string, File>) {
    onFilesChange(next);
  }

  function addModule() {
    onChange({ ...value, modules: [...value.modules, { id: crypto.randomUUID(), title: `Module ${value.modules.length + 1}`, lessons: [] }] });
  }

  function patchModule(id: string, patch: { title?: string }) {
    onChange({ ...value, modules: value.modules.map((module) => module.id === id ? { ...module, ...patch } : module) });
  }

  function moveModule(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= value.modules.length) return;
    const modules = [...value.modules];
    [modules[index], modules[destination]] = [modules[destination], modules[index]];
    onChange({ ...value, modules });
  }

  function addLesson(moduleId: string) {
    const lesson: CourseLesson = { id: crypto.randomUUID(), title: "", description: "", durationMinutes: undefined, resources: [], isPreview: false };
    onChange({ ...value, modules: value.modules.map((module) => module.id === moduleId ? { ...module, lessons: [...module.lessons, lesson] } : module) });
  }

  function patchLesson(moduleId: string, lessonId: string, patch: Partial<CourseLesson>) {
    onChange({ ...value, modules: value.modules.map((module) => module.id === moduleId ? {
      ...module,
      lessons: module.lessons.map((lesson) => lesson.id === lessonId ? { ...lesson, ...patch } : lesson),
    } : module) });
  }

  function moveLesson(moduleId: string, index: number, direction: -1 | 1) {
    const selectedModule = value.modules.find((item) => item.id === moduleId);
    if (!selectedModule) return;
    const destination = index + direction;
    if (destination < 0 || destination >= selectedModule.lessons.length) return;
    const lessons = [...selectedModule.lessons];
    [lessons[index], lessons[destination]] = [lessons[destination], lessons[index]];
    onChange({ ...value, modules: value.modules.map((item) => item.id === moduleId ? { ...item, lessons } : item) });
  }

  function addLessonFiles(moduleId: string, lessonId: string, selected: FileList | null) {
    if (!selected?.length) return;
    const lesson = value.modules.find((module) => module.id === moduleId)?.lessons.find((item) => item.id === lessonId);
    if (!lesson) return;
    const additions = Array.from(selected).map((file) => ({ id: crypto.randomUUID(), name: file.name, fileName: file.name }));
    const nextFiles = { ...files };
    Array.from(selected).forEach((file, index) => { nextFiles[additions[index].id] = file; });
    changeFiles(nextFiles);
    patchLesson(moduleId, lessonId, { resources: [...(lesson.resources ?? []), ...additions] });
  }

  function addPost() {
    const post: MembershipPost = { id: crypto.randomUUID(), title: "", body: "", createdAt: new Date().toISOString(), resources: [], status: "draft" };
    onChange({ ...value, membershipPosts: [...value.membershipPosts, post] });
  }

  function patchPost(id: string, patch: Partial<MembershipPost>) {
    onChange({ ...value, membershipPosts: value.membershipPosts.map((post) => post.id === id ? { ...post, ...patch } : post) });
  }

  function addPostFiles(postId: string, selected: FileList | null) {
    if (!selected?.length) return;
    const post = value.membershipPosts.find((item) => item.id === postId);
    if (!post) return;
    const additions = Array.from(selected).map((file) => ({ id: crypto.randomUUID(), name: file.name, fileName: file.name }));
    const nextFiles = { ...files };
    Array.from(selected).forEach((file, index) => { nextFiles[additions[index].id] = file; });
    changeFiles(nextFiles);
    patchPost(postId, { resources: [...(post.resources ?? []), ...additions] });
  }

  if (kind === "course") return (
    <div className="form-panel">
      <div className="form-section-heading"><span>02</span><div><h2>Programme du cours</h2><p>Organisez vos leçons et choisissez celles qui seront accessibles en aperçu.</p></div><button className="button button-light button-small" type="button" onClick={addModule}><Plus size={15} /> Ajouter un module</button></div>
      {value.modules.length ? <div className="editor-list">{value.modules.map((module, moduleIndex) => <article className="editor-item module-editor-item" key={module.id}>
        <div className="editor-item-heading"><strong>Module {moduleIndex + 1}</strong><div className="editor-reorder"><button className="icon-button" type="button" aria-label={`Monter le module ${moduleIndex + 1}`} disabled={moduleIndex === 0} onClick={() => moveModule(moduleIndex, -1)}><ArrowUp size={15} /></button><button className="icon-button" type="button" aria-label={`Descendre le module ${moduleIndex + 1}`} disabled={moduleIndex === value.modules.length - 1} onClick={() => moveModule(moduleIndex, 1)}><ArrowDown size={15} /></button><button className="icon-button delete-button" type="button" aria-label={`Supprimer le module ${moduleIndex + 1}`} onClick={() => onChange({ ...value, modules: value.modules.filter((item) => item.id !== module.id) })}><Trash size={15} /></button></div></div>
        <div className="field-group"><label htmlFor={`module-title-${module.id}`}>Titre du module</label><input className="field-input" id={`module-title-${module.id}`} value={module.title} onChange={(event) => patchModule(module.id, { title: event.target.value })} /></div>
        <div className="module-lessons">{module.lessons.map((lesson, lessonIndex) => <div className="lesson-editor" key={lesson.id}>
          <div className="editor-item-heading"><strong>Leçon {moduleIndex + 1}.{lessonIndex + 1}</strong><div className="editor-reorder"><button className="icon-button" type="button" aria-label={`Monter la leçon ${lessonIndex + 1} du module ${moduleIndex + 1}`} disabled={lessonIndex === 0} onClick={() => moveLesson(module.id, lessonIndex, -1)}><ArrowUp size={14} /></button><button className="icon-button" type="button" aria-label={`Descendre la leçon ${lessonIndex + 1} du module ${moduleIndex + 1}`} disabled={lessonIndex === module.lessons.length - 1} onClick={() => moveLesson(module.id, lessonIndex, 1)}><ArrowDown size={14} /></button><button className="icon-button delete-button" type="button" aria-label={`Supprimer la leçon ${lessonIndex + 1} du module ${moduleIndex + 1}`} onClick={() => onChange({ ...value, modules: value.modules.map((item) => item.id === module.id ? { ...item, lessons: item.lessons.filter((entry) => entry.id !== lesson.id) } : item) })}><Trash size={14} /></button></div></div>
          <div className="form-stack"><div className="field-group"><label htmlFor={`lesson-title-${lesson.id}`}>Titre de la leçon</label><input className="field-input" id={`lesson-title-${lesson.id}`} value={lesson.title} onChange={(event) => patchLesson(module.id, lesson.id, { title: event.target.value })} /></div><div className="form-two-col"><RichTextEditor id={`lesson-text-${lesson.id}`} label="Texte et consignes" value={lesson.descriptionContent ?? documentFromPlainText(lesson.description)} onChange={(document) => patchLesson(module.id, lesson.id, { descriptionContent: document, description: richTextToPlainText(document) })} productId={productId} privateContent localContent={localContent} files={files} onFilesChange={changeFiles} /><div className="field-group"><label htmlFor={`lesson-video-${lesson.id}`}>Vidéo YouTube ou Vimeo</label><input className="field-input" id={`lesson-video-${lesson.id}`} type="url" placeholder="https://youtu.be/…" value={lesson.videoUrl ?? ""} onChange={(event) => patchLesson(module.id, lesson.id, { videoUrl: event.target.value || undefined })} /><label className="check-row"><input type="checkbox" checked={Boolean(lesson.isPreview)} onChange={(event) => patchLesson(module.id, lesson.id, { isPreview: event.target.checked })} /> Proposer cette leçon en aperçu gratuit</label></div></div><div className="form-two-col"><div className="field-group"><label htmlFor={`lesson-duration-${lesson.id}`}>Durée (minutes)</label><input className="field-input" id={`lesson-duration-${lesson.id}`} type="number" min="1" value={lesson.durationMinutes ?? ""} onChange={(event) => patchLesson(module.id, lesson.id, { durationMinutes: event.target.value ? Number(event.target.value) : undefined })} /></div><div className="field-group"><label htmlFor={`lesson-files-${lesson.id}`}>Fichiers de la leçon</label><input className="field-input" id={`lesson-files-${lesson.id}`} type="file" multiple onChange={(event) => addLessonFiles(module.id, lesson.id, event.target.files)} />{lesson.resources?.map((resource) => <span className="resource-chip" key={resource.id}>{resource.fileName}</span>)}</div></div></div>
        </div>)}<button className="button button-light button-small" type="button" onClick={() => addLesson(module.id)}><Plus size={14} /> Ajouter une leçon</button></div>
      </article>)}</div> : <p className="field-help editor-empty">Ajoutez un module puis vos premières leçons.</p>}
    </div>
  );

  if (kind === "membership") return (
    <div className="form-panel">
      <div className="form-section-heading"><span>02</span><div><h2>Contenu réservé aux membres</h2><p>Publiez des notes, des vidéos ou des fichiers à votre rythme.</p></div><button className="button button-light button-small" type="button" onClick={addPost}><Plus size={15} /> Ajouter une publication</button></div>
      {value.membershipPosts.length ? <div className="editor-list">{value.membershipPosts.map((post, index) => <article className="editor-item" key={post.id}><div className="editor-item-heading"><strong>Publication {index + 1}</strong><div className="editor-reorder"><span className={`status-pill${post.status === "published" ? " is-live" : ""}`}>{post.status === "published" ? "Publiée" : "Brouillon"}</span><button className="icon-button delete-button" type="button" aria-label={`Supprimer la publication ${index + 1}`} onClick={() => onChange({ ...value, membershipPosts: value.membershipPosts.filter((item) => item.id !== post.id) })}><Trash size={15} /></button></div></div><div className="form-stack"><div className="field-group"><label htmlFor={`post-title-${post.id}`}>Titre de la publication</label><input className="field-input" id={`post-title-${post.id}`} value={post.title} onChange={(event) => patchPost(post.id, { title: event.target.value })} /></div><div className="form-two-col"><RichTextEditor id={`post-body-${post.id}`} label="Texte" value={post.bodyContent ?? documentFromPlainText(post.body)} onChange={(document) => patchPost(post.id, { bodyContent: document, body: richTextToPlainText(document) })} productId={productId} privateContent localContent={localContent} files={files} onFilesChange={changeFiles} /><div className="field-group"><label htmlFor={`post-video-${post.id}`}>Vidéo YouTube ou Vimeo</label><input className="field-input" id={`post-video-${post.id}`} type="url" placeholder="https://vimeo.com/…" value={post.videoUrl ?? ""} onChange={(event) => patchPost(post.id, { videoUrl: event.target.value || undefined })} /></div></div><div className="field-group"><label htmlFor={`post-files-${post.id}`}>Fichiers à partager</label><input className="field-input" id={`post-files-${post.id}`} type="file" multiple onChange={(event) => addPostFiles(post.id, event.target.files)} />{post.resources?.map((resource) => <span className="resource-chip" key={resource.id}>{resource.fileName}</span>)}</div><button className="button button-light button-small publish-post" type="button" onClick={() => patchPost(post.id, { status: post.status === "published" ? "draft" : "published" })}>{post.status === "published" ? "Remettre en brouillon" : "Publier cette publication"}</button></div></article>)}</div> : <p className="field-help editor-empty">Les publications publiées apparaîtront ici aux membres actifs.</p>}
      <div className="included-courses"><h3>Cours inclus dans l’abonnement</h3><p>Les membres pourront suivre ces cours tant que leur abonnement est actif.</p>{products.filter((product) => product.kind === "course" && product.creatorId === creatorId && (product.published || value.membershipCourseIds.includes(product.id))).map((course) => <label className="check-row course-choice" key={course.id}><input type="checkbox" checked={value.membershipCourseIds.includes(course.id)} onChange={(event) => onChange({ ...value, membershipCourseIds: event.target.checked ? [...value.membershipCourseIds, course.id] : value.membershipCourseIds.filter((id) => id !== course.id) })} /><span>{course.title}{!course.published && <small className="course-unpublished"> · dépublié, accès inclus préservé</small>}</span></label>)}{!products.some((product) => product.kind === "course" && product.published && product.creatorId === creatorId) && <p className="field-help">Publiez un cours pour pouvoir l’inclure ici.</p>}</div>
    </div>
  );

  return null;
}
