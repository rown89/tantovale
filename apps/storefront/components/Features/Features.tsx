import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Code, Users, Zap } from "lucide-react";

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

export default function Features() {
  return (
    <section className="py-20 px-4 bg-gray-100">
      <h2 className="text-4xl font-bold text-center mb-12">Why Choose Us?</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {features.map((feature, index) => (
          <Card key={index} className="bg-white border-gray-200">
            <CardHeader>
              <CardTitle className="flex items-center text-2xl">
                {feature.icon}
                <span className="ml-2">{feature.title}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-gray-600">
                {feature.description}
              </CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
