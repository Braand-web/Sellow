import Image from "next/image";

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <Image src="/sellow-icon.svg" alt="" width={30} height={30} />
    </span>
  );
}
