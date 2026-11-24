using System;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Phineas.Data.Migrations
{
    /// <inheritdoc />
    public partial class AjoutHistoriqueSuivis : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "HistoriquesSuiviOpportunite",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    OpportuniteId = table.Column<int>(type: "int", nullable: false),
                    Action = table.Column<string>(type: "varchar(120)", maxLength: 120, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    DatePrevue = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    Cloture = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    DateCloture = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    AuteurId = table.Column<string>(type: "varchar(450)", maxLength: 450, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_HistoriquesSuiviOpportunite", x => x.Id);
                    table.ForeignKey(
                        name: "FK_HistoriquesSuiviOpportunite_AspNetUsers_AuteurId",
                        column: x => x.AuteurId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_HistoriquesSuiviOpportunite_OpportunitesVente_OpportuniteId",
                        column: x => x.OpportuniteId,
                        principalTable: "OpportunitesVente",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_HistoriquesSuiviOpportunite_AuteurId",
                table: "HistoriquesSuiviOpportunite",
                column: "AuteurId");

            migrationBuilder.CreateIndex(
                name: "IX_HistoriquesSuiviOpportunite_OpportuniteId",
                table: "HistoriquesSuiviOpportunite",
                column: "OpportuniteId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "HistoriquesSuiviOpportunite");
        }
    }
}
