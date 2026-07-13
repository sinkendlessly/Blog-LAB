-- ============================================================
-- Blog LAB · 数据库完整建表脚本
-- 基于项目 SQLAlchemy 模型生成（2026-07-13）
-- 适用于 MySQL 8.0+
--
-- 使用方式：
--   mysql -u root -p blogshare < init.sql
-- 或在 Docker 容器中：
--   docker exec -i mysql mysql -u root -p blogshare < init.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS blogshare
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci;

USE blogshare;

-- ============================================================
-- 1. 用户表
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id              INT             NOT NULL AUTO_INCREMENT,
    email           VARCHAR(255)    NOT NULL,
    username        VARCHAR(50)     NOT NULL,
    phone           VARCHAR(20)     NULL,
    password_hash   VARCHAR(255)    NOT NULL,
    avatar          VARCHAR(500)    NULL,
    bio             TEXT            NULL,
    role            ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER',
    is_active       TINYINT(1)      NOT NULL DEFAULT 1,
    is_super_admin  TINYINT(1)      NOT NULL DEFAULT 0,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email),
    UNIQUE KEY uq_users_username (username),
    UNIQUE KEY uq_users_phone (phone),
    INDEX ix_users_email (email),
    INDEX ix_users_username (username),
    INDEX ix_users_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 2. 分类表（树形自引用）
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
    id              INT             NOT NULL AUTO_INCREMENT,
    name            VARCHAR(100)    NOT NULL,
    slug            VARCHAR(150)    NOT NULL,
    description     VARCHAR(500)    NULL,
    parent_id       INT             NULL,
    sort_order      INT             NOT NULL DEFAULT 0,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_categories_slug (slug),
    INDEX ix_categories_name (name),
    INDEX ix_categories_slug (slug),
    INDEX ix_categories_parent_id (parent_id),
    CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 3. 标签表
-- ============================================================
CREATE TABLE IF NOT EXISTS tags (
    id              INT             NOT NULL AUTO_INCREMENT,
    name            VARCHAR(50)     NOT NULL,
    slug            VARCHAR(80)     NOT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_tags_name (name),
    UNIQUE KEY uq_tags_slug (slug),
    INDEX ix_tags_name (name),
    INDEX ix_tags_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 4. 文章表（content 用 LONGTEXT 存储 Markdown）
-- ============================================================
CREATE TABLE IF NOT EXISTS articles (
    id              INT             NOT NULL AUTO_INCREMENT,
    title           VARCHAR(255)    NOT NULL,
    slug            VARCHAR(300)    NOT NULL,
    content         LONGTEXT        NOT NULL,
    excerpt         VARCHAR(500)    NULL,
    cover_image     VARCHAR(500)    NULL,
    status          ENUM('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
    author_id       INT             NOT NULL,
    category_id     INT             NULL,
    views           INT             NOT NULL DEFAULT 0,
    is_pinned       TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '管理员置顶',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    published_at    DATETIME        NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_articles_slug (slug),
    INDEX ix_articles_title (title),
    INDEX ix_articles_slug (slug),
    INDEX ix_articles_status (status),
    INDEX ix_articles_author_id (author_id),
    INDEX ix_articles_category_id (category_id),
    INDEX ix_articles_published_at (published_at),
    INDEX ix_articles_is_pinned (is_pinned),
    CONSTRAINT fk_articles_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_articles_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 5. 文章-标签 多对多关联表
-- ============================================================
CREATE TABLE IF NOT EXISTS article_tags (
    article_id      INT             NOT NULL,
    tag_id          INT             NOT NULL,

    PRIMARY KEY (article_id, tag_id),
    CONSTRAINT fk_article_tags_article FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
    CONSTRAINT fk_article_tags_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 6. 评论表（支持嵌套回复）
-- ============================================================
CREATE TABLE IF NOT EXISTS comments (
    id              INT             NOT NULL AUTO_INCREMENT,
    content         TEXT            NOT NULL,
    article_id      INT             NOT NULL,
    user_id         INT             NOT NULL,
    parent_id       INT             NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    INDEX ix_comments_article_id (article_id),
    INDEX ix_comments_user_id (user_id),
    INDEX ix_comments_parent_id (parent_id),
    CONSTRAINT fk_comments_article FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
    CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_comments_parent FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 7. 统一互动表（替代 likes + favorites + shares 旧表）
--     UNIQUE 约束防止并发 TOCTOU 竞态产生重复记录
-- ============================================================
CREATE TABLE IF NOT EXISTS interactions (
    id              INT             NOT NULL AUTO_INCREMENT,
    user_id         INT             NOT NULL,
    target_id       INT             NOT NULL,
    target_type     ENUM('article', 'comment') NOT NULL,
    action          ENUM('like', 'favorite', 'share') NOT NULL,
    platform        VARCHAR(30)     NULL COMMENT '分享平台',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_interactions_user_target_action (user_id, target_id, target_type, action),
    INDEX ix_interactions_user_id (user_id),
    INDEX ix_interactions_target (target_id, target_type),
    CONSTRAINT fk_interactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 8. 用户关注表
-- ============================================================
CREATE TABLE IF NOT EXISTS follows (
    follower_id     INT             NOT NULL,
    following_id    INT             NOT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (follower_id, following_id),
    CONSTRAINT fk_follows_follower FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_follows_following FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 9. 通知表
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
    id              INT             NOT NULL AUTO_INCREMENT,
    user_id         INT             NOT NULL COMMENT '接收通知的用户',
    actor_id        INT             NULL COMMENT '触发通知的用户（点赞者/评论者等）',
    type            VARCHAR(32)     NOT NULL DEFAULT 'system' COMMENT '通知类型: like / favorite / comment / reply / follow / system',
    title           VARCHAR(255)    NOT NULL DEFAULT '',
    content         TEXT            NOT NULL,
    link            VARCHAR(500)    NULL COMMENT '点击通知跳转的链接',
    is_read         TINYINT(1)      NOT NULL DEFAULT 0,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    INDEX ix_notifications_user_id (user_id),
    INDEX ix_notifications_is_read (is_read),
    INDEX ix_notifications_created_at (created_at),
    CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_notifications_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
