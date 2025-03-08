import Image from "next/image";
import Link from "next/link";
import { Linkedin } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen">
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
          Un marketplace per l&apos;acquisto e la vendita di oggetti usati,{" "}
          <Link
            href="https://github.com/rown89/tantovale"
            target="_blank"
            className="underline hover:text-cyan-500"
          >
            open source
          </Link>
          .
        </p>
        <div className="flex justify-center space-x-4 animate-fade-in">
          <Link
            href="https://www.linkedin.com/in/danilomongelli/recent-activity/all/"
            target="_blank"
          >
            <Linkedin
              size="20px"
              className="text-grey-500 hover:text-cyan-500"
            />
          </Link>
        </div>
      </section>
    </div>
  );
}
