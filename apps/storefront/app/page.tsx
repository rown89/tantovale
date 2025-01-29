import Footer from "@/components/Footer/Footer";
import Hero from "@/components/Hero/Hero";
import Newsletter from "@/components/Newsletter/Newsletter";
import Timeline from "@/components/Timeline/Timeline";
import Features from "@/components/Features/Features";

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-black">
      <Hero />
      <Features />
      <Timeline />
      <Newsletter />
      <Footer />
    </div>
  );
}
