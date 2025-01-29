import { Github, Twitter } from "lucide-react";

export default function Footer() {
  return (
    <footer className="py-8 px-4 border-t border-gray-200">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center">
        <p className="text-sm text-gray-600 mb-4 sm:mb-0">
          © 2024 Open Source Marketplace. All rights reserved.
        </p>
        <div className="flex space-x-4">
          <a href="#" className="text-gray-600 hover:text-black">
            <Github className="h-6 w-6" />
          </a>
          <a href="#" className="text-gray-600 hover:text-black">
            <Twitter className="h-6 w-6" />
          </a>
        </div>
      </div>
    </footer>
  );
}
