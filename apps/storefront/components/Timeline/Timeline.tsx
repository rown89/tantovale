import { CheckCircle2, Circle } from "lucide-react";

const timelineItems = [
  { title: "Project Inception", date: "January 2024", completed: true },
  { title: "Alpha Release", date: "March 2024", completed: false },
  { title: "Beta Testing", date: "June 2024", completed: false },
  { title: "Official Launch", date: "September 2024", completed: false },
];

export default function Timeline() {
  return (
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
  );
}
