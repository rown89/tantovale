import Image from "next/image";

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-black">
      <section className="py-20 px-4 text-center">
        <div className="flex w-full justify-center items-center pt-20 mb-6">
          <Image
            src="/logo-tantovale.svg"
            alt="logo"
            width={300}
            height={70}
            priority
          />
        </div>
        <p className="text-xl md:text-2xl mb-8 animate-fade-in-up">
          Un marketplace per l&apos;acquisto e la vendita di articoli usati,
          open source.
        </p>
      </section>
    </div>
  );
}
