import { Button } from "@/components/ui/button";
import { Github, Twitter } from "lucide-react";

export default function Hero() {
  return (
    <section className="py-20 px-4 text-center">
      <h1 className="text-5xl md:text-7xl font-bold mb-6 animate-fade-in-down">
        Open Source Marketplace
      </h1>
      <p className="text-xl md:text-2xl mb-8 animate-fade-in-up">
        A revolutionary platform built in public, for the community
      </p>
      <div className="flex justify-center space-x-4 animate-fade-in">
        <Button className="bg-black text-white hover:bg-gray-800 hover:cursor-pointer">
          Learn More
        </Button>
        <Button
          variant="outline"
          className="border-black text-black hover:bg-gray-100 hover:cursor-pointer"
        >
          <Github className="mr-2 h-4 w-4" /> Star on GitHub
        </Button>
      </div>
      <div className="mt-12 flex justify-center items-center space-x-4 text-sm">
        <a href="#" className="flex items-center hover:underline text-black">
          <Twitter className="mr-2 h-4 w-4" /> Follow our journey
        </a>
        <span>•</span>
        <a href="#" className="hover:underline text-black">
          Join the discussion
        </a>
      </div>
    </section>
  );
}
