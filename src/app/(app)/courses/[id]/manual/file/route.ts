import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveManualDownload } from "@/lib/manual-source-file";

export const dynamic = "force-dynamic";

/** 实操宝典：下载操作手册源文件（原 PDF/Word，旧课程回退 book/ 同名资料） */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const { id } = await params;
  const course = await prisma.course.findUnique({
    where: { id },
    select: { id: true, published: true, manualSourceName: true },
  });
  if (!course || (!course.published && user.role !== "admin")) {
    return NextResponse.json({ error: "课程不存在或未上架" }, { status: 404 });
  }
  const file = await resolveManualDownload(course.id, course.manualSourceName);
  if (!file) {
    return NextResponse.json(
      { error: "这门课暂没有保存可下载的操作手册源文件。" },
      { status: 404 },
    );
  }
  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(file.downloadName)}`,
      "Content-Length": String(file.buffer.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
