import { Link } from "react-router-dom";
import { Construction } from "lucide-react";
import { Button } from "@/components/ui/button";

/** 占位页面：后续阶段实现的页面暂用此组件。 */
export default function Placeholder({ name }: { name: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-20 text-center">
      <Construction className="mb-4 h-12 w-12 text-muted-foreground" />
      <h2 className="text-xl font-semibold">{name}</h2>
      <p className="mt-2 text-sm text-muted-foreground">该页面将在后续开发阶段实现</p>
      <Button asChild variant="outline" className="mt-6">
        <Link to="/">返回首页</Link>
      </Button>
    </div>
  );
}
