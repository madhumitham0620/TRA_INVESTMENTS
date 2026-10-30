
USE tra_invest;

CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id VARCHAR(40) NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(254) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,

    role ENUM(
        'ADMIN',
        'MANAGER',
        'SALES_EXECUTIVE',
        'CUSTOMER'
    ) NOT NULL DEFAULT 'CUSTOMER',

    status ENUM(
        'PENDING',
        'ACTIVE',
        'INACTIVE'
    ) NOT NULL DEFAULT 'ACTIVE',

    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_users_user_id (user_id),
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS investment_agreements (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    agreement_number VARCHAR(50) NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    created_by BIGINT UNSIGNED NOT NULL,

    principal_amount DECIMAL(15,2) NOT NULL,
    interest_rate DECIMAL(7,4) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,

    status ENUM(
        'PENDING_APPROVAL',
        'APPROVED',
        'REJECTED',
        'SENT_BACK',
        'DRAFT'
    ) NOT NULL DEFAULT 'DRAFT',

    manager_remarks TEXT NULL,
    reviewed_by BIGINT UNSIGNED NULL,
    reviewed_at DATETIME NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_agreement_number (agreement_number),

    CONSTRAINT fk_agreement_customer
        FOREIGN KEY (customer_id) REFERENCES users(id),

    CONSTRAINT fk_agreement_creator
        FOREIGN KEY (created_by) REFERENCES users(id),

    CONSTRAINT fk_agreement_reviewer
        FOREIGN KEY (reviewed_by) REFERENCES users(id),

    INDEX idx_agreement_status (status),
    INDEX idx_agreement_customer (customer_id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
