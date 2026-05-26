import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { 
  Rocket, 
  Code2, 
  Palette, 
  Zap, 
  Database, 
  Shield, 
  Smartphone,
  Globe,
  Settings,
  Star
} from "lucide-react";

const LibraryShowcase = () => {
  const [progress, setProgress] = useState(65);
  const [sliderValue, setSliderValue] = useState([50]);
  const { toast } = useToast();

  const libraries = [
    { name: "React 18", icon: <Code2 className="w-5 h-5" />, description: "Latest React with concurrent features" },
    { name: "TypeScript", icon: <Shield className="w-5 h-5" />, description: "Type-safe development experience" },
    { name: "Vite", icon: <Zap className="w-5 h-5" />, description: "Lightning fast build tool" },
    { name: "Tailwind CSS", icon: <Palette className="w-5 h-5" />, description: "Utility-first CSS framework" },
    { name: "shadcn/ui", icon: <Settings className="w-5 h-5" />, description: "Beautiful, accessible components" },
    { name: "React Query", icon: <Database className="w-5 h-5" />, description: "Powerful data fetching" },
    { name: "React Router", icon: <Globe className="w-5 h-5" />, description: "Declarative routing" },
    { name: "React Hook Form", icon: <Smartphone className="w-5 h-5" />, description: "Performant forms with validation" },
    { name: "Lucide React", icon: <Star className="w-5 h-5" />, description: "Beautiful icon library" },
    { name: "Zod", icon: <Shield className="w-5 h-5" />, description: "TypeScript-first schema validation" }
  ];

  const showToast = () => {
    toast({
      title: "🎉 Toast Notification",
      description: "Your React app is fully loaded with awesome libraries!",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-primary p-6">
      <div className="max-w-7xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-card/10 backdrop-blur-sm rounded-full px-6 py-3 mb-6">
            <Rocket className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">Ready to Build</span>
          </div>
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Your React App is Ready!
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Pre-configured with the most important libraries and tools for modern React development
          </p>
        </div>

        {/* Interactive Demo */}
        <Tabs defaultValue="components" className="mb-12">
          <TabsList className="grid w-full grid-cols-3 max-w-md mx-auto">
            <TabsTrigger value="components">Components</TabsTrigger>
            <TabsTrigger value="libraries">Libraries</TabsTrigger>
            <TabsTrigger value="features">Features</TabsTrigger>
          </TabsList>

          <TabsContent value="components" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card className="border-primary/20 shadow-elegant">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-5 h-5 text-primary" />
                    Interactive Controls
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="demo-input">Input Field</Label>
                    <Input id="demo-input" placeholder="Type something..." />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch id="demo-switch" />
                    <Label htmlFor="demo-switch">Enable notifications</Label>
                  </div>
                  <Button onClick={showToast} className="w-full">
                    Show Toast
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-primary/20 shadow-elegant">
                <CardHeader>
                  <CardTitle>Progress & Sliders</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Progress: {progress}%</Label>
                    <Progress value={progress} className="w-full" />
                  </div>
                  <div className="space-y-2">
                    <Label>Slider Value: {sliderValue[0]}</Label>
                    <Slider
                      value={sliderValue}
                      onValueChange={setSliderValue}
                      max={100}
                      step={1}
                    />
                  </div>
                  <Button 
                    variant="outline" 
                    onClick={() => setProgress(Math.random() * 100)}
                    className="w-full"
                  >
                    Randomize Progress
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-primary/20 shadow-elegant">
                <CardHeader>
                  <CardTitle>Badges & Icons</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="default">Default</Badge>
                    <Badge variant="secondary">Secondary</Badge>
                    <Badge variant="outline">Outline</Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    <Rocket className="w-6 h-6 text-primary" />
                    <Code2 className="w-6 h-6 text-primary" />
                    <Palette className="w-6 h-6 text-primary" />
                    <Zap className="w-6 h-6 text-primary" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="libraries">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {libraries.map((lib, index) => (
                <Card key={index} className="border-primary/20 shadow-elegant hover:shadow-glow transition-all duration-300">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                      {lib.icon}
                      {lib.name}
                    </CardTitle>
                    <CardDescription>{lib.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="features">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card className="border-primary/20 shadow-elegant">
                <CardHeader>
                  <CardTitle>🎨 Design System</CardTitle>
                  <CardDescription>
                    Beautiful dark theme with custom gradients and shadows
                  </CardDescription>
                </CardHeader>
              </Card>
              
              <Card className="border-primary/20 shadow-elegant">
                <CardHeader>
                  <CardTitle>📱 Responsive</CardTitle>
                  <CardDescription>
                    Mobile-first design that works on all devices
                  </CardDescription>
                </CardHeader>
              </Card>
              
              <Card className="border-primary/20 shadow-elegant">
                <CardHeader>
                  <CardTitle>⚡ Performance</CardTitle>
                  <CardDescription>
                    Optimized build with Vite and tree-shaking
                  </CardDescription>
                </CardHeader>
              </Card>
              
              <Card className="border-primary/20 shadow-elegant">
                <CardHeader>
                  <CardTitle>🔒 Type Safety</CardTitle>
                  <CardDescription>
                    Full TypeScript support with strict type checking
                  </CardDescription>
                </CardHeader>
              </Card>
              
              <Card className="border-primary/20 shadow-elegant">
                <CardHeader>
                  <CardTitle>🧩 Component Library</CardTitle>
                  <CardDescription>
                    50+ pre-built components from shadcn/ui
                  </CardDescription>
                </CardHeader>
              </Card>
              
              <Card className="border-primary/20 shadow-elegant">
                <CardHeader>
                  <CardTitle>🚀 Ready to Deploy</CardTitle>
                  <CardDescription>
                    Configured and ready for production deployment
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Getting Started */}
        <Card className="border-primary/20 shadow-glow">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Ready to Start Building?</CardTitle>
            <CardDescription>
              Your React app comes with everything you need to build modern web applications
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <div className="flex flex-wrap justify-center gap-4">
              <Button size="lg" className="shadow-elegant">
                <Code2 className="w-4 h-4 mr-2" />
                Start Coding
              </Button>
              <Button variant="outline" size="lg">
                <Database className="w-4 h-4 mr-2" />
                View Documentation
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LibraryShowcase;