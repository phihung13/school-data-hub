// Chọn codec video nền theo NĂNG LỰC THẬT của máy — 25/08/2026.
//
// Chủ đầu tư: "tôi vẫn cứ thấy lag lag kiểu gì ấy". Đo bằng mediaCapabilities trên đúng
// máy đó: AV1 1080p trả `smooth: false`, H.264 trả `smooth: true` — máy không có giải mã
// cứng AV1 nên CPU gánh cả 1080p bằng phần mềm, và cả app ì theo trong lúc video chạy.
//
// `canPlayType` (cách chọn cũ) chỉ trả lời "CÓ MỞ ĐƯỢC không" — mở được bằng cách bò
// cũng là mở được. `decodingInfo` trả lời đúng câu cần hỏi: "mở có MƯỢT không". Máy nào
// AV1 mượt vẫn nhận bản AV1 nhẹ hơn; máy yếu nhận H.264 nặng hơn vài trăm KB nhưng chạy
// bằng phần cứng — băng thông rẻ hơn khung hình.
//
// Fallback về canPlayType khi API không có (trình duyệt cũ): thà chọn như cũ còn hơn tắt
// video; và try/catch trọn — đây là tối ưu, không bao giờ được phép chặn đăng nhập.
export async function av1Muot(): Promise<boolean> {
  try {
    const mc = navigator.mediaCapabilities;
    if (!mc?.decodingInfo) {
      return document.createElement("video").canPlayType('video/mp4; codecs="av01.0.08M.08"') !== "";
    }
    const r = await mc.decodingInfo({
      type: "file",
      video: {
        contentType: 'video/mp4; codecs="av01.0.08M.08"',
        width: 1920,
        height: 1080,
        bitrate: 2_500_000,
        framerate: 24,
      },
    });
    return r.supported && r.smooth;
  } catch {
    return false;
  }
}
