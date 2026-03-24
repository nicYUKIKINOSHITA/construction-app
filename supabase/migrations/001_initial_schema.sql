-- =============================================
-- 施工管理チェックアプリ データベーススキーマ
-- =============================================

-- ユーザー（認証なし、名前選択のみ）
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 案件
CREATE TABLE projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  assignee_id UUID REFERENCES users(id),
  estimate_pdf_url TEXT,
  notify_days_before INTEGER DEFAULT 7,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES users(id)
);

-- 明細
CREATE TABLE items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  deadline DATE NOT NULL,
  merged_into_id UUID REFERENCES items(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- チェック（各明細×各ステップ）
CREATE TABLE checks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL CHECK (step_number BETWEEN 1 AND 12),
  sub_step INTEGER,
  checked BOOLEAN DEFAULT false,
  checked_at TIMESTAMPTZ,
  checked_by UUID REFERENCES users(id),
  stop_reason TEXT,
  UNIQUE(item_id, step_number, sub_step)
);

-- 停止理由マスタ
CREATE TABLE stop_reasons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

-- インデックス
CREATE INDEX idx_items_project ON items(project_id) WHERE merged_into_id IS NULL;
CREATE INDEX idx_checks_item ON checks(item_id);
CREATE INDEX idx_checks_unchecked ON checks(item_id) WHERE checked = false;
CREATE INDEX idx_projects_assignee ON projects(assignee_id);

-- RLS（匿名アクセス許可）
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE stop_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON checks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON stop_reasons FOR ALL USING (true) WITH CHECK (true);

-- 初期データ
INSERT INTO users (name) VALUES
  ('田中'), ('鈴木'), ('佐藤'), ('山田'), ('高橋'), ('伊藤');

INSERT INTO stop_reasons (label, sort_order) VALUES
  ('ゼネコン返答待ち', 1),
  ('業者返答待ち', 2),
  ('資料不足', 3),
  ('前工程未完了', 4),
  ('施主確認待ち', 5),
  ('社内確認中', 6),
  ('その他', 7);
