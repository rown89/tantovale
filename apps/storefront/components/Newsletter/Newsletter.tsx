"use client";

import { useState } from "react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";

export default function Newsletter() {
  const [email, setEmail] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement newsletter signup logic
    console.log("Signing up with email:", email);
    setEmail("");
  };

  return (
    <div className="max-w-2xl mx-auto text-center">
      <h2 className="text-4xl font-bold mb-4">Stay Updated</h2>
      <p className="mb-8 text-gray-600">
        Subscribe to our newsletter for project updates and early access
        opportunities.
      </p>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col sm:flex-row gap-4 justify-center"
      >
        <Input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bg-white border-gray-300 text-black placeholder-gray-500"
          required
        />
        <Button type="submit" className="bg-black text-white hover:bg-gray-800">
          Subscribe
        </Button>
      </form>
    </div>
  );
}
