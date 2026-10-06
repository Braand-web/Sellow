"use client";

import { useEffect, useRef, useState } from "react";

export function WordReveal({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [activeWords, setActiveWords] = useState(0);
  const words = text.split(" ");

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        let index = 0;
        const reveal = () => {
          index += 1;
          setActiveWords(index);
          if (index < words.length) window.setTimeout(reveal, 85);
        };
        reveal();
        observer.disconnect();
      },
      { threshold: 0.24 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [words.length]);

  return (
    <p className="word-reveal" ref={ref} aria-label={text}>
      {words.map((word, index) => (
        <span className={index < activeWords ? "word-active" : ""} aria-hidden="true" key={`${word}-${index}`}>
          {word}{index < words.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  );
}
