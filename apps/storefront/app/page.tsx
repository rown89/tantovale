import Newsletter from "@/components/Newsletter/Newsletter";
import { Button } from "@workspace/ui/components/ui/button";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@workspace/ui/components/ui/accordion";
import {
  CheckCircle2,
  Circle,
  Code,
  Github,
  Linkedin,
  Users,
  Zap,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/ui/card";

const features = [
  {
    icon: <Code className="h-8 w-8 text-black" />,
    title: "Open Source",
    description: "Fully transparent and community-driven development process",
  },
  {
    icon: <Users className="h-8 w-8 text-black" />,
    title: "Community-Powered",
    description: "Built by developers, for developers",
  },
  {
    icon: <Zap className="h-8 w-8 text-black" />,
    title: "Lightning Fast",
    description: "Optimized for performance and scalability",
  },
];

const timelineItems = [
  { title: "Project Inception", date: "January 2024", completed: true },
  { title: "Alpha Release", date: "March 2024", completed: false },
  { title: "Beta Testing", date: "June 2024", completed: false },
  { title: "Official Launch", date: "September 2024", completed: false },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-black">
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="item-1">
          <AccordionTrigger>Is it accessible?</AccordionTrigger>
          <AccordionContent>
            Yes. It adheres to the WAI-ARIA design pattern.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="item-2">
          <AccordionTrigger>Is it styled?</AccordionTrigger>
          <AccordionContent>
            Yes. It comes with default styles that matches the other
            components&apos; aesthetic.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="item-3">
          <AccordionTrigger>Is it animated?</AccordionTrigger>
          <AccordionContent>
            Yes. It's animated by default, but you can disable it if you prefer.
          </AccordionContent>
        </AccordionItem>
      </Accordion>

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
            <Linkedin className="mr-2 h-4 w-4" /> Follow our journey
          </a>
          <span>•</span>
          <a href="#" className="hover:underline text-black">
            Join the discussion
          </a>
        </div>
      </section>
      {/* Timeline */}
      <section className="py-20 px-4">
        <h2 className="text-4xl font-bold text-center mb-12">Our Roadmap</h2>
        <div className="max-w-3xl mx-auto">
          {timelineItems.map((item, index) => (
            <div key={index} className="flex mb-8 last:mb-0">
              <div className="flex flex-col items-center mr-4">
                {item.completed ? (
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                ) : (
                  <Circle className="h-8 w-8 text-gray-400" />
                )}
                {index !== timelineItems.length - 1 && (
                  <div className="w-px h-full bg-gray-300 mt-2"></div>
                )}
              </div>
              <div>
                <h3 className="text-xl font-semibold">{item.title}</h3>
                <p className="text-gray-600">{item.date}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Newsletter */}
      <section className="py-20 px-4 bg-gray-100">
        <Newsletter />
      </section>
    </div>
  );
}
