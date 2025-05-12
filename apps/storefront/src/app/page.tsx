"use client";

import Link from "next/link";
import { Github } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Logo } from "#components/logo/logo";

const NOISE_RADIUS = 150;
const NOISE_STRENGTH = 30;
const PARTICLE_COUNT = 100;
const LOGO_MOVEMENT_STRENGTH = 20; // Maximum pixels to move
const FRICTION = 0.95; // Friction to slow down particles gradually

// Smooth logo animation
const useSmoothLogoMovement = (
  mousePosition: React.RefObject<{ x: number; y: number }>,
) => {
  const [logoPosition, setLogoPosition] = useState({
    x: 0,
    y: 0,
    rotateX: 0, // Added rotation X
    rotateY: 0, // Added rotation Y
  });

  useEffect(() => {
    let animationId: number;

    const updateLogoPosition = () => {
      // Calculate target position based on mouse position relative to window center
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const centerX = windowWidth / 2;
      const centerY = windowHeight / 2;

      // Calculate distance from center (normalized between -1 and 1)
      const mouseX = mousePosition.current.x || centerX;
      const mouseY = mousePosition.current.y || centerY;

      const distanceX = (mouseX - centerX) / centerX; // -1 to 1
      const distanceY = (mouseY - centerY) / centerY; // -1 to 1

      // Apply smooth damping (easing) to current position
      const targetX = distanceX * LOGO_MOVEMENT_STRENGTH;
      const targetY = distanceY * LOGO_MOVEMENT_STRENGTH;

      // Calculate 3D rotation - inverse rotation to create a more natural effect
      // Multiplying by a smaller value to limit rotation range
      const targetRotateY = distanceX * 30; // -20 to 20 degrees
      const targetRotateX = -distanceY * 25; // -15 to 15 degrees

      setLogoPosition((current) => {
        // Smooth interpolation (easing)
        const newX = current.x + (targetX - current.x) * 0.05;
        const newY = current.y + (targetY - current.y) * 0.05;
        const newRotateX =
          current.rotateX + (targetRotateX - current.rotateX) * 0.05;
        const newRotateY =
          current.rotateY + (targetRotateY - current.rotateY) * 0.05;

        return {
          x: newX,
          y: newY,
          rotateX: newRotateX,
          rotateY: newRotateY,
        };
      });

      animationId = requestAnimationFrame(updateLogoPosition);
    };

    updateLogoPosition();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [mousePosition]);

  return logoPosition;
};

// Typewriter effect
const useTypewriter = (
  text: string,
  speed: number = 100,
  delay: number = 100,
) => {
  const [displayText, setDisplayText] = useState("");
  const [showCaret, setShowCaret] = useState(true);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;

    // Start typing after initial delay
    const startTimer = setTimeout(() => {
      let i = 0;

      // Function to add one character at a time
      const typeNextChar = () => {
        if (i < text.length) {
          setDisplayText(text.substring(0, i + 1));
          i++;
          timer = setTimeout(typeNextChar, speed);
        } else {
          setIsComplete(true);
        }
      };

      typeNextChar();
    }, delay);

    // Blink the caret
    const caretInterval = setInterval(() => {
      setShowCaret((prev) => !prev);
    }, 700);

    return () => {
      clearTimeout(startTimer);
      clearTimeout(timer);
      clearInterval(caretInterval);
    };
  }, [text, speed, delay]);

  return { displayText, showCaret, isComplete };
};

const useCanvasAnimation = (
  mousePosition: React.MutableRefObject<{ x: number; y: number }>,
) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<
    Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
    }>
  >([]);

  // Initialize particles only once with default values
  useEffect(() => {
    // Initialize particles only on the client side
    if (typeof window === "undefined") return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    const newParticles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      newParticles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: 0, // x velocity
        vy: 0, // y velocity
        size: Math.random() * 2 + 1,
        color: `rgba(255, 255, 255, ${Math.random() * 0.5})`,
      });
    }
    particlesRef.current = newParticles;
  }, []);

  useEffect(() => {
    // Ensure we're only running this on the client side
    if (typeof window === "undefined") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas dimensions
    const updateCanvasSize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;

      // Ensure particles are within new dimensions
      particlesRef.current.forEach((particle) => {
        if (particle.x > width) particle.x = width;
        if (particle.y > height) particle.y = height;
      });
    };

    updateCanvasSize();
    window.addEventListener("resize", updateCanvasSize);

    // Animation loop
    let animationId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw particles
      particlesRef.current.forEach((particle) => {
        const dx = mousePosition.current.x - particle.x;
        const dy = mousePosition.current.y - particle.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < NOISE_RADIUS) {
          // Move particles away from mouse by adding to velocity
          const angle = Math.atan2(dy, dx);
          const force = (NOISE_RADIUS - distance) / NOISE_RADIUS;

          particle.vx -= Math.cos(angle) * force * NOISE_STRENGTH * 0.2;
          particle.vy -= Math.sin(angle) * force * NOISE_STRENGTH * 0.2;
        }

        // Apply velocity
        particle.x += particle.vx;
        particle.y += particle.vy;

        // Apply friction
        particle.vx *= FRICTION;
        particle.vy *= FRICTION;

        // Keep particles within canvas
        if (particle.x < 0) {
          particle.x = 0;
          particle.vx *= -0.5; // Bounce with reduced energy
        }
        if (particle.x > canvas.width) {
          particle.x = canvas.width;
          particle.vx *= -0.5;
        }
        if (particle.y < 0) {
          particle.y = 0;
          particle.vy *= -0.5;
        }
        if (particle.y > canvas.height) {
          particle.y = canvas.height;
          particle.vy *= -0.5;
        }

        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", updateCanvasSize);
      cancelAnimationFrame(animationId);
    };
  }, [mousePosition]);

  return canvasRef;
};

export default function Home() {
  const mousePosition = useRef({ x: 0, y: 0 });
  const canvasRef = useCanvasAnimation(mousePosition);
  const {
    displayText: text1,
    showCaret: showCaret1,
    isComplete: isComplete1,
  } = useTypewriter("Un marketplace", 100, 100);

  const { displayText: text2, showCaret: showCaret2 } = useTypewriter(
    "open source.",
    100,
    100 + "Un marketplace".length * 100,
  );

  const logoPosition = useSmoothLogoMovement(mousePosition);

  // Animation states
  const [logoVisible, setLogoVisible] = useState(false);
  const [githubVisible, setGithubVisible] = useState(false);
  const [statusVisible, setStatusVisible] = useState(false);

  // Sequence the fade-in animations
  useEffect(() => {
    // Show logo first
    const logoTimer = setTimeout(() => setLogoVisible(true), 300);
    // Then GitHub button
    const githubTimer = setTimeout(() => setGithubVisible(true), 800);
    // Then project status
    const statusTimer = setTimeout(() => setStatusVisible(true), 1300);

    return () => {
      clearTimeout(logoTimer);
      clearTimeout(githubTimer);
      clearTimeout(statusTimer);
    };
  }, []);

  // Track mouse position
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mousePosition.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-black"
      style={{
        background:
          "radial-gradient(circle at center, #333333 0%, #111111 50%, #000000 100%)",
      }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0 pointer-events-none"
        aria-hidden="true"
      />

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 text-white">
        <div className="max-w-3xl mx-auto text-center flex flex-col items-center">
          <div
            className={`w-48 h-48 mx-auto mb-12 relative transition-opacity duration-1000 ease-in-out ${logoVisible ? "opacity-100" : "opacity-0"}`}
            style={{
              transform: `translate(${logoPosition.x}px, ${logoPosition.y}px) rotateX(${logoPosition.rotateX}deg) rotateY(${logoPosition.rotateY}deg)`,
              transition: "transform 0.1s ease-out, opacity 1s ease-in-out",
              transformStyle: "preserve-3d",
              perspective: "1000px",
              filter: `drop-shadow(${-logoPosition.rotateY / 3}px ${logoPosition.rotateX / 3}px 10px rgba(0, 0, 0, 0.5))`,
            }}
          >
            <Logo className="w-full h-full" />
          </div>

          <h1 className="gap-0 md:gap-2 mb-8 text-3xl font-bold leading-tight md:text-4xl lg:text-5xl bg-clip-text text-transparent bg-gradient-to-r from-blue-200 via-purple-200 to-pink-200 inline-flex flex-wrap justify-center items-center">
            {text1}
            {showCaret1 && !isComplete1 && (
              <span className="text-white ml-1 animate-pulse text-3xl md:text-4xl lg:text-5xl opacity-60">
                |
              </span>
            )}
            {isComplete1 && (
              <>
                <span className="flex bg-clip-text text-transparent bg-gradient-to-r from-yellow-200 to-yellow-400 text-3xl md:text-4xl lg:text-5xl">
                  {" " + text2}
                  <div className="flex items-center justify-center w-2">
                    {showCaret2 && (
                      <span className="text-white ml-1 animate-pulse text-3xl md:text-4xl lg:text-5xl opacity-60">
                        |
                      </span>
                    )}
                  </div>
                </span>
              </>
            )}
          </h1>

          <div
            className={`flex items-center justify-center mb-12 transition-opacity duration-1000 ease-in-out ${githubVisible ? "opacity-100" : "opacity-0"}`}
          >
            <Link
              href="https://github.com/rown89/tantovale"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-4 py-2 space-x-2 text-sm font-medium transition-colors rounded-md bg-white/10 hover:bg-white/20"
            >
              <Github className="w-5 h-5" />
              <span>View on GitHub</span>
            </Link>
          </div>

          <div
            className={`flex gap-2 items-center flex-col md:flex-row transition-opacity duration-1000 ease-in-out ${githubVisible ? "opacity-100" : "opacity-0"}`}
          >
            <h2 className="mb-2 text-xl font-medium">Stato:</h2>
            <div className="inline-block px-3 py-1 text-sm font-medium rounded-full bg-blue-500/30">
              In costruzione
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
