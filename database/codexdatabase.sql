-- --------------------------------------------------------
-- Host:                         127.0.0.1
-- Server version:               10.4.32-MariaDB - mariadb.org binary distribution
-- Server OS:                    Win64
-- HeidiSQL Version:             12.16.0.7229
-- --------------------------------------------------------

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


-- Dumping database structure for codex_healthcare
CREATE DATABASE IF NOT EXISTS `codex_healthcare` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci */;
USE `codex_healthcare`;

-- Dumping structure for table codex_healthcare.ai_training_logs
CREATE TABLE IF NOT EXISTS `ai_training_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `query_type` enum('text','image') DEFAULT 'text',
  `user_query` text DEFAULT NULL,
  `image_path` varchar(255) DEFAULT NULL,
  `gemini_response` text DEFAULT NULL,
  `is_verified` tinyint(1) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Data exporting was unselected.

-- Dumping structure for table codex_healthcare.drugs_library
CREATE TABLE IF NOT EXISTS `drugs_library` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `active_ingredient` varchar(255) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `usage_info` text DEFAULT NULL,
  `side_effects` text DEFAULT NULL,
  `warnings` text DEFAULT NULL,
  `dosage` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Data exporting was unselected.

-- Dumping structure for table codex_healthcare.game_scores
CREATE TABLE IF NOT EXISTS `game_scores` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `game_type` varchar(50) DEFAULT NULL,
  `difficulty` varchar(20) DEFAULT NULL,
  `moves` int(11) DEFAULT 0,
  `time_seconds` int(11) NOT NULL,
  `comment` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `game_scores_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Data exporting was unselected.

-- Dumping structure for table codex_healthcare.natural_alternatives
CREATE TABLE IF NOT EXISTS `natural_alternatives` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `drug_id` int(11) DEFAULT NULL,
  `alternative_name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `benefit_info` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `drug_id` (`drug_id`),
  CONSTRAINT `natural_alternatives_ibfk_1` FOREIGN KEY (`drug_id`) REFERENCES `drugs_library` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Data exporting was unselected.

-- Dumping structure for table codex_healthcare.notification_sent_log
CREATE TABLE IF NOT EXISTS `notification_sent_log` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `dedupe_key` varchar(191) NOT NULL,
  `user_id` int(11) NOT NULL,
  `kind` varchar(64) NOT NULL,
  `sent_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dedupe` (`dedupe_key`),
  KEY `idx_user_sent` (`user_id`,`sent_at`),
  CONSTRAINT `notification_sent_log_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=99 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table codex_healthcare.screening_conditions
CREATE TABLE IF NOT EXISTS `screening_conditions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `slug` varchar(64) NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table codex_healthcare.screening_options
CREATE TABLE IF NOT EXISTS `screening_options` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `question_id` int(11) NOT NULL,
  `label` varchar(500) NOT NULL,
  `risk_points` tinyint(4) NOT NULL DEFAULT 0,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `question_id` (`question_id`),
  CONSTRAINT `screening_options_ibfk_1` FOREIGN KEY (`question_id`) REFERENCES `screening_questions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=109 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table codex_healthcare.screening_questions
CREATE TABLE IF NOT EXISTS `screening_questions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `condition_id` int(11) NOT NULL,
  `prompt` text NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `condition_id` (`condition_id`),
  CONSTRAINT `screening_questions_ibfk_1` FOREIGN KEY (`condition_id`) REFERENCES `screening_conditions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=37 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table codex_healthcare.user_calendar_events
CREATE TABLE IF NOT EXISTS `user_calendar_events` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `title` varchar(255) NOT NULL,
  `notes` text DEFAULT NULL,
  `kind` enum('event','medication','reminder') NOT NULL DEFAULT 'event',
  `event_date` date NOT NULL,
  `event_time` time DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_user_date` (`user_id`,`event_date`),
  CONSTRAINT `user_calendar_events_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table codex_healthcare.user_expo_push_tokens
CREATE TABLE IF NOT EXISTS `user_expo_push_tokens` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `expo_push_token` varchar(512) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_token` (`user_id`,`expo_push_token`),
  KEY `idx_user_id` (`user_id`),
  CONSTRAINT `user_expo_push_tokens_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table codex_healthcare.user_interactions
CREATE TABLE IF NOT EXISTS `user_interactions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `module` varchar(100) DEFAULT NULL,
  `query` text DEFAULT NULL,
  `response` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `user_interactions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=64 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Data exporting was unselected.

-- Dumping structure for table codex_healthcare.users
CREATE TABLE IF NOT EXISTS `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `height` float DEFAULT NULL,
  `weight` float DEFAULT NULL,
  `gender` enum('erkek','kadin','diger') DEFAULT NULL,
  `age` int(11) DEFAULT NULL,
  `bmi_interpretation` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Data exporting was unselected.

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;
