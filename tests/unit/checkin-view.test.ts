// tests/unit/checkin-view.test.ts — gói "checkin-trang-thai".
//
// Lỗi được khoá ở đây là lỗi ĐÃ CHẠY THẬT trên bản dev: /checkin không đọc
// `checkin.getTodayStatus` nên luôn mở bốn ô trắng, kể cả khi máy chủ đã trả
// `checkedInToday=true, mood=2, checkedInAt=16:35`. Em chạm lần hai thì router
// chạy `on conflict do update set mood` — tâm trạng cũ bị thay — và màn hình hiện
// ĐÚNG MỘT câu ăn mừng y hệt lần đầu. Ba mệnh đề phải giữ vĩnh viễn:
//
//   1. Chưa biết thì KHÔNG mở form. Bốn ô cảm xúc là một lời khẳng định "hôm nay
//      con chưa ghi"; mở chúng ra lúc chưa hỏi xong là đoán tin tốt từ im lặng.
//   2. Biết là đã ghi thì phải vào màn "đã ghi", và chỉ rời màn đó khi em bấm nút
//      đổi tường minh — không đổi dữ liệu của trẻ bằng một cú chạm lỡ tay.
//   3. Ghi đè thì phải NÓI RA ("đổi từ Vui sang Buồn"), kể cả khi bản bị đè mới
//      chỉ nằm trong hàng đợi offline.
//
// Vitest chạy ở môi trường "node" (vitest.config.ts) nên không render được React.
// Vì vậy phần logic nằm ở các hàm thuần được export, còn phần JSX được ràng bằng
// quét mã nguồn — cùng lối đã dùng ở tests/unit/frontend-trang-thai.test.ts.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MOOD_LABEL } from "@hub/core/contracts";
import { asMoodValue, changeNotice, checkinStage } from "@/components/checkin-view";
import { sameLocalDay } from "@/lib/offline-queue";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const viewSource = readFileSync(join(repoRoot, "apps", "hub", "components", "checkin-view.tsx"), "utf8");
const queueSource = readFileSync(join(repoRoot, "apps", "hub", "lib", "offline-queue.ts"), "utf8");

/** Bỏ chú thích trước khi quét: chính file này ghi lại lỗi cũ trong chú thích đầu file. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:@\w])\/\/.*$/gm, "$1");
}

describe("checkinStage — chưa biết thì không mở form trắng", () => {
  it("đang hỏi máy chủ thì ở thể chờ, không mời chọn cảm xúc", () => {
    expect(
      checkinStage({ isPending: true, isError: false, checkedInToday: undefined, wantsChange: false }),
    ).toBe("loading");
  });

  it("đã ghi hôm nay thì vào màn 'đã ghi', không phải bốn ô", () => {
    expect(
      checkinStage({ isPending: false, isError: false, checkedInToday: true, wantsChange: false }),
    ).toBe("recorded");
  });

  it("chưa ghi hôm nay thì mở bốn ô như cũ", () => {
    expect(
      checkinStage({ isPending: false, isError: false, checkedInToday: false, wantsChange: false }),
    ).toBe("pick");
  });

  it("em bấm 'Đổi tâm trạng' thì mở ô chọn, dù dữ liệu nói đã ghi rồi", () => {
    // Đây là lựa chọn tường minh của em — nhánh DUY NHẤT được phép rời màn "đã ghi".
    expect(
      checkinStage({ isPending: false, isError: false, checkedInToday: true, wantsChange: true }),
    ).toBe("pick");
  });

  it("hỏi hỏng thì vẫn cho ghi (offline-first), không khoá em ở màn chờ", () => {
    // "Offline vẫn lưu — tự gửi sau." là lời hứa in trên chính màn này. Lấy việc
    // không đọc được trạng thái làm cớ chặn em check-in là phá lời hứa đó, và bỏ
    // rơi đúng em đang cần giúp nhất. Màn hình bù lại bằng câu nói thẳng là chưa biết.
    expect(
      checkinStage({ isPending: false, isError: true, checkedInToday: undefined, wantsChange: false }),
    ).toBe("pick");
  });
});

describe("asMoodValue — không in 'undefined' vào câu nói với học sinh", () => {
  it("nhận đúng bốn giá trị của thang cảm xúc", () => {
    expect(asMoodValue(1)).toBe(1);
    expect(asMoodValue(4)).toBe(4);
  });

  it("mọi giá trị khác trả null để nơi gọi bỏ hẳn câu, không đoán một tâm trạng", () => {
    expect(asMoodValue(null)).toBeNull();
    expect(asMoodValue(0)).toBeNull();
    expect(asMoodValue(5)).toBeNull();
    expect(asMoodValue("4")).toBeNull();
    expect(asMoodValue(undefined)).toBeNull();
  });
});

describe("changeNotice — ghi đè phải nói ra", () => {
  it("lần ghi đầu trong ngày thì không dựng ra một thay đổi không có thật", () => {
    expect(changeNotice(null, 1)).toBeNull();
  });

  it("đổi tâm trạng thì gọi tên CẢ cái cũ lẫn cái mới", () => {
    const notice = changeNotice(4, 1);
    expect(notice).not.toBeNull();
    expect(notice).toContain(MOOD_LABEL[4]); // Vui
    expect(notice).toContain(MOOD_LABEL[1]); // Buồn
    expect(notice).toMatch(/đổi/i);
  });

  it("chọn lại đúng tâm trạng cũ thì nói 'vẫn là', không nói là đã đổi", () => {
    const notice = changeNotice(3, 3);
    expect(notice).toContain(MOOD_LABEL[3]);
    expect(notice).toMatch(/vẫn/i);
    expect(notice).not.toMatch(/đổi từ/i);
  });
});

describe("hàng đợi offline — một ngày một bản ghi", () => {
  it("nhận ra hai mốc cùng ngày địa phương, kể cả quanh mốc 00:00 ICT", () => {
    // 07:00 ICT = 00:00 UTC. Cắt chuỗi ISO theo UTC sẽ đẩy mọi giờ trước 07:00 về
    // ngày hôm trước — đúng lỗi lib/date.ts sinh ra để chặn.
    const morning = new Date(2026, 6, 31, 6, 30);
    const evening = new Date(2026, 6, 31, 21, 15);
    expect(sameLocalDay(morning.toISOString(), evening)).toBe(true);
  });

  it("hai ngày khác nhau thì không gộp — bản hôm qua không bị bản hôm nay đè", () => {
    const yesterday = new Date(2026, 6, 30, 23, 59);
    const today = new Date(2026, 6, 31, 0, 1);
    expect(sameLocalDay(yesterday.toISOString(), today)).toBe(false);
  });

  it("mốc thời gian hỏng không được coi là 'cùng ngày' (sẽ đè nhầm bản đúng)", () => {
    expect(sameLocalDay("không-phải-ngày", new Date())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Quét mã nguồn. Những mệnh đề dưới đây không làm hỏng typecheck và không làm
// hỏng build — chúng chỉ hỏng khi một học sinh thật bấm lần thứ hai trong ngày.
// ---------------------------------------------------------------------------
describe("quét mã nguồn màn check-in", () => {
  it("/checkin PHẢI đọc getTodayStatus — đây là gốc của cả gói việc", () => {
    expect(withoutComments(viewSource)).toContain("checkin.getTodayStatus.useQuery");
  });

  it("có nhánh đang tải và nhánh lỗi cho truy vấn đó", () => {
    const source = withoutComments(viewSource);
    expect(source).toMatch(/isPending/);
    expect(source).toMatch(/isError|\.error/);
  });

  it("có nút đổi tâm trạng tường minh, không đổi ngầm", () => {
    const source = withoutComments(viewSource);
    expect(source).toContain("Đổi tâm trạng");
    expect(source).toContain("setWantsChange");
  });

  it("màn thành công nhắc lại đúng lựa chọn vừa ghi", () => {
    // Trước đây cả hai lần bấm ra một câu giống hệt nhau, nên em chạm nhầm ô cũng
    // không có cách nào biết mình vừa ghi cái gì.
    const source = withoutComments(viewSource);
    expect(source).toContain("Con đã ghi:");
    expect(source).toContain("MOOD_LABEL[lastMood]");
  });

  it("giữ giọng Glow & Grow: không từ vựng vận hành trên màn của học sinh", () => {
    // DESIGN-GUIDELINES §8 — "cờ / ngưỡng / leo thang / định mức / GVCN" chỉ được
    // xuất hiện ở buồng lái, tâm lý cụm, điều hành.
    const source = withoutComments(viewSource);
    for (const word of ["GVCN", "ngưỡng", "leo thang", "định mức", "cờ khẩn"]) {
      expect(source, `màn học sinh không được dùng từ vận hành "${word}"`).not.toContain(word);
    }
  });

  it("hàng đợi offline không cấp clientId mới cho cùng một ngày", () => {
    // Hai bản ghi cùng ngày trong hàng đợi = thứ tự keys() của IndexedDB quyết định
    // tâm trạng nào của em sống sót sau khi flush. Đó là ghi đè im lặng do máy quyết.
    const source = withoutComments(queueSource);
    expect(source).toContain("sameLocalDay");
    expect(source).toContain("existing?.clientId ?? randomClientId()");
  });

  it("flush không dừng cả hàng đợi vì một bản ghi hỏng", () => {
    // `break` cũ khoá luôn mọi check-in xếp sau (DEBT #31): buồng lái GVCN đọc im
    // lặng đó thành "em ổn".
    expect(withoutComments(queueSource)).not.toMatch(/}\s*catch\s*{[^}]*\bbreak\b/);
  });
});
